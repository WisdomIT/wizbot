import { type Content, GoogleGenAI, type Part } from '@google/genai';

import {
  type ProviderAdapter,
  ProviderApiError,
  type RecordBlock,
  type RecordMessage,
  type ResolvedTool,
  type TurnOutcome,
  type TurnRequest,
} from './types';

/**
 * Google (Gemini) 어댑터. 웹 검색은 google_search 그라운딩 — 함수 선언과 동시에 실을 수
 * 있다(단, toolConfig.includeServerSideToolInvocations 필요 — 없으면 400 이 알려준다).
 * Gemini 특유의 사정 (pelican 원본): functionCall 에 id 가 없어 이름으로 짝을 맞추고,
 * Gemini 3 의 thoughtSignature 는 파트를 통째로 보존해 되돌려 준다. thought(사고 요약)
 * 파트는 답변이 아니며, thoughtsTokenCount 는 과금 집계에 합산한다.
 */

function stripUnsupported(schema: Record<string, unknown>): Record<string, unknown> {
  const { additionalProperties: _dropped, ...rest } = schema;
  const properties = rest.properties as Record<string, Record<string, unknown>> | undefined;
  return {
    ...rest,
    ...(properties
      ? { properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, stripUnsupported(value)])) }
      : {}),
  };
}

interface QueuedCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface NativeState {
  contents: Content[];
  responseParts: Part[];
  queue: QueuedCall[];
}

export class GeminiAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  runTurn(request: TurnRequest): Promise<TurnOutcome> {
    const contents: Content[] = [
      ...request.history.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] })),
      { role: 'user', parts: [{ text: request.userText }] },
    ];
    return this.loop({ contents, responseParts: [], queue: [] }, request);
  }

  resumeTurn(native: unknown, resolved: ResolvedTool, request: TurnRequest): Promise<TurnOutcome> {
    const state = native as NativeState;
    //  Gemini 의 functionResponse 는 이름으로 짝을 맞춘다 — toolUseId 는 "이름-…" 형태로 만들었다
    const name = resolved.toolUseId.split('::')[0];
    state.responseParts.push({ functionResponse: { name, response: { result: resolved.content } } });
    return this.loop(state, request, [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: resolved.toolUseId, content: resolved.content, ...(resolved.isError ? { is_error: true } : {}) }] },
    ]);
  }

  private async loop(state: NativeState, request: TurnRequest, record: RecordMessage[] = []): Promise<TurnOutcome> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let emittedText = false;

    const config = {
      systemInstruction: request.system,
      abortSignal: request.signal,
      tools: [
        { functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parametersJsonSchema: stripUnsupported(tool.inputSchema) })) },
        ...(request.webSearch ? [{ googleSearch: {} }] : []),
      ],
      //  서버 측 도구(검색)와 함수 선언을 한 요청에 실으려면 켜야 한다 —
      //  없으면 400 이 이 플래그 이름을 알려준다 (pelican #35 실검증, wizbot 에서도 재현)
      ...(request.webSearch && request.tools.length > 0
        ? { toolConfig: { includeServerSideToolInvocations: true } as Record<string, unknown> }
        : {}),
    };

    for (let iteration = 0; iteration < request.maxIterations; iteration++) {
      // 1) 대기 중인 tool 부터 비운다 — 카드가 나오면 여기서 멈춘다
      const resultRecord: RecordBlock[] = [];
      while (state.queue.length > 0) {
        const call = state.queue[0];
        request.onToolStart(call.name);
        const result = await request.runTool(call.name, call.args);
        state.queue.shift();
        if ('card' in result) {
          if (resultRecord.length > 0) record.push({ role: 'user', content: resultRecord });
          return {
            record,
            usage,
            emittedText,
            pending: { toolUseId: call.id, tool: call.name, input: call.args, card: result.card, native: state },
          };
        }
        state.responseParts.push({ functionResponse: { name: call.name, response: { result: result.content } } });
        resultRecord.push({ type: 'tool_result', tool_use_id: call.id, content: result.content, ...(result.isError ? { is_error: true } : {}) });
      }
      if (resultRecord.length > 0) record.push({ role: 'user', content: resultRecord });

      // 2) 모아둔 함수 결과를 보낸다
      if (state.responseParts.length > 0) {
        state.contents.push({ role: 'user', parts: state.responseParts });
        state.responseParts = [];
      }

      const modelParts: Part[] = [];
      const assistantRecord: RecordBlock[] = [];
      const functionCalls: QueuedCall[] = [];
      let searchNotified = false;
      //  usageMetadata 는 요청 내 누적으로 오므로 마지막 값을 반복(iteration)별로 합산한다
      let turnUsage: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number } | null = null;

      try {
        const stream = await ai.models.generateContentStream({ model: this.model, contents: state.contents, config });
        for await (const chunk of stream) {
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            //  사고 요약 파트 — 답변이 아니다. 내용은 쓰지 않는다 (원본은 "생각 중"만 알림)
            if ((part as { thought?: boolean }).thought) continue;
            if (part.text) {
              emittedText = true;
              request.onText(part.text);
              modelParts.push(part);
              assistantRecord.push({ type: 'text', text: part.text });
            } else if (part.functionCall) {
              //  thoughtSignature 보존을 위해 파트를 통째로 되돌려 준다 (원본 주석)
              modelParts.push(part);
              functionCalls.push({
                id: `${part.functionCall.name ?? ''}::${iteration}-${functionCalls.length}`,
                name: part.functionCall.name ?? '',
                args: (part.functionCall.args ?? {}) as Record<string, unknown>,
              });
            }
          }
          if (!searchNotified && chunk.candidates?.[0]?.groundingMetadata) {
            searchNotified = true;
            assistantRecord.push({ type: 'web_search', query: '' });
            request.onToolStart('web_search');
          }
          if (chunk.usageMetadata) turnUsage = chunk.usageMetadata;
        }
      } catch (error) {
        if (request.signal.aborted) throw error;
        const status = (error as { status?: number }).status ?? null;
        throw new ProviderApiError(typeof status === 'number' ? status : null, error instanceof Error ? error.message : String(error), emittedText);
      }

      usage.inputTokens += turnUsage?.promptTokenCount ?? 0;
      //  사고 토큰은 candidates 에 안 들어간다 — 과금 집계에는 합쳐야 맞다 (원본과 동일)
      usage.outputTokens += (turnUsage?.candidatesTokenCount ?? 0) + (turnUsage?.thoughtsTokenCount ?? 0);
      usage.cacheReadTokens += turnUsage?.cachedContentTokenCount ?? 0;

      for (const call of functionCalls) {
        assistantRecord.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
      }
      if (assistantRecord.length > 0) record.push({ role: 'assistant', content: assistantRecord });
      state.contents.push({ role: 'model', parts: modelParts.length > 0 ? modelParts : [{ text: '' }] });

      if (functionCalls.length === 0) break;
      state.queue = functionCalls;
    }

    return { record, usage, emittedText };
  }
}

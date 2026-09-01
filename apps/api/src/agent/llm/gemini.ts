import { type Content, type FunctionCall, GoogleGenAI, type Part } from '@google/genai';

import { type ProviderAdapter, ProviderApiError, type RecordBlock, type RecordMessage, type TurnOutcome, type TurnRequest } from './types';

/**
 * Google (Gemini) 어댑터. 웹 검색은 google_search 그라운딩 — 함수 선언과 동시에 실을 수
 * 있다 (pelican-concierge 실측). 스키마의 additionalProperties 는 Gemini 가 거부하므로 벗긴다.
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

export class GeminiAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async runTurn(request: TurnRequest): Promise<TurnOutcome> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const record: RecordMessage[] = [];
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let emittedText = false;

    const config = {
      systemInstruction: request.system,
      abortSignal: request.signal,
      tools: [
        { functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parametersJsonSchema: stripUnsupported(tool.inputSchema) })) },
        ...(request.webSearch ? [{ googleSearch: {} }] : []),
      ],
    };

    const contents: Content[] = [
      ...request.history.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] })),
      { role: 'user', parts: [{ text: request.userText }] },
    ];

    for (let iteration = 0; iteration < request.maxIterations; iteration++) {
      const modelParts: Part[] = [];
      const assistantRecord: RecordBlock[] = [];
      const functionCalls: FunctionCall[] = [];
      let searchNotified = false;
      //  usageMetadata 는 요청 내 누적으로 오므로 마지막 값을 반복(iteration)별로 합산한다
      let turnUsage: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number } | null = null;

      try {
        const stream = await ai.models.generateContentStream({ model: this.model, contents, config });
        for await (const chunk of stream) {
          const parts = chunk.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            if (part.text) {
              emittedText = true;
              request.onText(part.text);
              modelParts.push(part);
              assistantRecord.push({ type: 'text', text: part.text });
            } else if (part.functionCall) {
              modelParts.push(part);
              functionCalls.push(part.functionCall);
            }
          }
          //  그라운딩(웹 검색)이 쓰였는지는 메타데이터로만 보인다
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
      usage.outputTokens += turnUsage?.candidatesTokenCount ?? 0;
      usage.cacheReadTokens += turnUsage?.cachedContentTokenCount ?? 0;

      for (const [index, call] of functionCalls.entries()) {
        assistantRecord.push({
          type: 'tool_use',
          id: call.id ?? `gemini-${iteration}-${index}`,
          name: call.name ?? '',
          input: (call.args ?? {}) as Record<string, unknown>,
        });
      }
      if (assistantRecord.length > 0) record.push({ role: 'assistant', content: assistantRecord });
      contents.push({ role: 'model', parts: modelParts.length > 0 ? modelParts : [{ text: '' }] });

      if (functionCalls.length === 0) break;

      const responseParts: Part[] = [];
      const resultRecord: RecordBlock[] = [];
      for (const [index, call] of functionCalls.entries()) {
        const name = call.name ?? '';
        request.onToolStart(name);
        const result = await request.runTool(name, (call.args ?? {}) as Record<string, unknown>);
        responseParts.push({ functionResponse: { id: call.id, name, response: { result: result.content } } });
        resultRecord.push({
          type: 'tool_result',
          tool_use_id: call.id ?? `gemini-${iteration}-${index}`,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        });
      }
      contents.push({ role: 'user', parts: responseParts });
      record.push({ role: 'user', content: resultRecord });
    }

    return { record, usage, emittedText };
  }
}

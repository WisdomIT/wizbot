import OpenAI from 'openai';

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
 * OpenAI (ChatGPT) 어댑터 — **Responses API** (pelican-concierge #3 과 같은 선택).
 * Chat Completions 가 아니라 Responses 를 쓰는 이유: 네이티브 웹 검색(web_search)이 여기에만 있다.
 * 루프·재개 연결은 previous_response_id 로 — 히스토리를 다시 보내지 않아 토큰이 절약된다.
 */

interface QueuedCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

interface NativeState {
  previousResponseId: string | null;
  outputs: OpenAI.Responses.ResponseInputItem[];
  queue: QueuedCall[];
}

export class OpenAiAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  runTurn(request: TurnRequest): Promise<TurnOutcome> {
    const initialInput: OpenAI.Responses.ResponseInput = [
      ...request.history.map((turn) => ({ role: turn.role, content: turn.text }) as OpenAI.Responses.ResponseInputItem),
      { role: 'user', content: request.userText },
    ];
    return this.loop({ previousResponseId: null, outputs: [], queue: [] }, request, initialInput);
  }

  resumeTurn(native: unknown, resolved: ResolvedTool, request: TurnRequest): Promise<TurnOutcome> {
    const state = native as NativeState;
    state.outputs.push({ type: 'function_call_output', call_id: resolved.toolUseId, output: resolved.content });
    return this.loop(state, request, null, [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: resolved.toolUseId, content: resolved.content, ...(resolved.isError ? { is_error: true } : {}) }] },
    ]);
  }

  private async loop(
    state: NativeState,
    request: TurnRequest,
    initialInput: OpenAI.Responses.ResponseInput | null,
    record: RecordMessage[] = [],
  ): Promise<TurnOutcome> {
    const client = new OpenAI({ apiKey: this.apiKey });
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let emittedText = false;

    const tools: OpenAI.Responses.Tool[] = request.tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: false,
    }));
    if (request.webSearch) tools.push({ type: 'web_search' } as OpenAI.Responses.Tool);

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
            pending: { toolUseId: call.callId, tool: call.name, input: call.args, card: result.card, native: state },
          };
        }
        state.outputs.push({ type: 'function_call_output', call_id: call.callId, output: result.content });
        resultRecord.push({ type: 'tool_result', tool_use_id: call.callId, content: result.content, ...(result.isError ? { is_error: true } : {}) });
      }
      if (resultRecord.length > 0) record.push({ role: 'user', content: resultRecord });

      const input = state.outputs.length > 0 ? state.outputs : (initialInput ?? []);

      let response: OpenAI.Responses.Response;
      try {
        const stream = client.responses.stream(
          {
            model: this.model,
            instructions: request.system,
            input,
            tools,
            ...(state.previousResponseId ? { previous_response_id: state.previousResponseId } : {}),
          },
          { signal: request.signal },
        );
        stream.on('response.output_text.delta', (event) => {
          emittedText = true;
          request.onText(event.delta);
        });
        response = await stream.finalResponse();
      } catch (error) {
        if (request.signal.aborted) throw error;
        const status = error instanceof OpenAI.APIError ? (typeof error.status === 'number' ? error.status : null) : null;
        throw new ProviderApiError(status, error instanceof Error ? error.message : String(error), emittedText);
      }

      usage.inputTokens += response.usage?.input_tokens ?? 0;
      usage.outputTokens += response.usage?.output_tokens ?? 0;
      usage.cacheReadTokens += response.usage?.input_tokens_details?.cached_tokens ?? 0;
      state.previousResponseId = response.id;
      state.outputs = [];

      const assistantRecord: RecordBlock[] = [];
      const functionCalls: QueuedCall[] = [];
      for (const item of response.output) {
        if (item.type === 'message') {
          for (const part of item.content) {
            if (part.type === 'output_text' && part.text) assistantRecord.push({ type: 'text', text: part.text });
          }
        } else if (item.type === 'function_call') {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(item.arguments) as Record<string, unknown>;
          } catch {
            /* 빈 입력으로 실행 — tool 쪽 검증이 거른다 */
          }
          functionCalls.push({ callId: item.call_id, name: item.name, args });
          assistantRecord.push({ type: 'tool_use', id: item.call_id, name: item.name, input: args });
        } else if (item.type === 'web_search_call') {
          const query = (item as { action?: { query?: string } }).action?.query ?? '';
          assistantRecord.push({ type: 'web_search', query });
          request.onToolStart('web_search');
        }
      }
      if (assistantRecord.length > 0) record.push({ role: 'assistant', content: assistantRecord });

      if (functionCalls.length === 0) break;
      state.queue = functionCalls;
    }

    return { record, usage, emittedText };
  }
}

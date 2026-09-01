import OpenAI from 'openai';

import { type ProviderAdapter, ProviderApiError, type RecordBlock, type RecordMessage, type TurnOutcome, type TurnRequest } from './types';

/**
 * OpenAI (ChatGPT) 어댑터 — **Responses API** (pelican-concierge #3 과 같은 선택).
 * Chat Completions 가 아니라 Responses 를 쓰는 이유: 네이티브 웹 검색(web_search)이 여기에만 있다.
 * 루프 연결은 previous_response_id 로 — 히스토리를 다시 보내지 않아 토큰이 절약된다.
 */
export class OpenAiAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async runTurn(request: TurnRequest): Promise<TurnOutcome> {
    const client = new OpenAI({ apiKey: this.apiKey });
    const record: RecordMessage[] = [];
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

    let input: OpenAI.Responses.ResponseInput = [
      ...request.history.map((turn) => ({ role: turn.role, content: turn.text }) as OpenAI.Responses.ResponseInputItem),
      { role: 'user', content: request.userText },
    ];
    let previousResponseId: string | undefined;

    for (let iteration = 0; iteration < request.maxIterations; iteration++) {
      let response: OpenAI.Responses.Response;
      try {
        const stream = client.responses.stream(
          {
            model: this.model,
            instructions: request.system,
            input,
            tools,
            ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
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
      previousResponseId = response.id;

      const assistantRecord: RecordBlock[] = [];
      const functionCalls: { callId: string; name: string; args: Record<string, unknown> }[] = [];
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

      const outputs: OpenAI.Responses.ResponseInputItem[] = [];
      const resultRecord: RecordBlock[] = [];
      for (const call of functionCalls) {
        request.onToolStart(call.name);
        const result = await request.runTool(call.name, call.args);
        outputs.push({ type: 'function_call_output', call_id: call.callId, output: result.content });
        resultRecord.push({ type: 'tool_result', tool_use_id: call.callId, content: result.content, ...(result.isError ? { is_error: true } : {}) });
      }
      record.push({ role: 'user', content: resultRecord });
      //  previous_response_id 로 잇는다 — 다음 입력은 함수 결과만
      input = outputs;
    }

    return { record, usage, emittedText };
  }
}

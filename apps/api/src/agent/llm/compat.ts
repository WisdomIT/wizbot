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
 * OpenAI 호환(로컬 LLM) 어댑터 — Chat Completions. 로컬 서버(ollama·vLLM·LM Studio 등)가
 * 가장 널리 구현한 표면이라 Responses 가 아니라 이쪽을 쓴다. 웹 검색 없음(Capabilities).
 */

interface QueuedCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface NativeState {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  queue: QueuedCall[];
}

export class OpenAiCompatAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  runTurn(request: TurnRequest): Promise<TurnOutcome> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.system },
      ...request.history.map((turn) => ({ role: turn.role, content: turn.text }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
      { role: 'user', content: request.userText },
    ];
    return this.loop({ messages, queue: [] }, request);
  }

  resumeTurn(native: unknown, resolved: ResolvedTool, request: TurnRequest): Promise<TurnOutcome> {
    const state = native as NativeState;
    state.messages.push({ role: 'tool', tool_call_id: resolved.toolUseId, content: resolved.content });
    return this.loop(state, request, [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: resolved.toolUseId, content: resolved.content, ...(resolved.isError ? { is_error: true } : {}) }] },
    ]);
  }

  private async loop(state: NativeState, request: TurnRequest, record: RecordMessage[] = []): Promise<TurnOutcome> {
    //  로컬 엔드포인트는 키가 없을 수 있다 — SDK 가 빈 키를 거부하므로 자리값
    const client = new OpenAI({ apiKey: this.apiKey || 'local', baseURL: this.baseUrl });
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let emittedText = false;

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = request.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));

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
        state.messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
        resultRecord.push({ type: 'tool_result', tool_use_id: call.id, content: result.content, ...(result.isError ? { is_error: true } : {}) });
      }
      if (resultRecord.length > 0) record.push({ role: 'user', content: resultRecord });

      const toolCalls = new Map<number, { id: string; name: string; args: string }>();
      let text = '';
      try {
        const stream = await client.chat.completions.create(
          {
            model: this.model,
            messages: state.messages,
            tools,
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal: request.signal },
        );
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            emittedText = true;
            text += delta.content;
            request.onText(delta.content);
          }
          for (const call of delta?.tool_calls ?? []) {
            const entry = toolCalls.get(call.index) ?? { id: '', name: '', args: '' };
            if (call.id) entry.id = call.id;
            if (call.function?.name) entry.name += call.function.name;
            if (call.function?.arguments) entry.args += call.function.arguments;
            toolCalls.set(call.index, entry);
          }
          if (chunk.usage) {
            usage.inputTokens += chunk.usage.prompt_tokens ?? 0;
            usage.outputTokens += chunk.usage.completion_tokens ?? 0;
          }
        }
      } catch (error) {
        if (request.signal.aborted) throw error;
        const status = error instanceof OpenAI.APIError ? (typeof error.status === 'number' ? error.status : null) : null;
        throw new ProviderApiError(status, error instanceof Error ? error.message : String(error), emittedText);
      }

      const calls = [...toolCalls.values()].filter((call) => call.name);
      const assistantRecord: RecordBlock[] = [];
      if (text) assistantRecord.push({ type: 'text', text });

      if (calls.length === 0) {
        if (assistantRecord.length > 0) record.push({ role: 'assistant', content: assistantRecord });
        break;
      }

      state.messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.args } })),
      });

      state.queue = calls.map((call) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.args) as Record<string, unknown>;
        } catch {
          /* 빈 입력으로 실행 — tool 쪽 검증이 거른다 */
        }
        assistantRecord.push({ type: 'tool_use', id: call.id, name: call.name, input: args });
        return { id: call.id, name: call.name, args };
      });
      record.push({ role: 'assistant', content: assistantRecord });
    }

    return { record, usage, emittedText };
  }
}

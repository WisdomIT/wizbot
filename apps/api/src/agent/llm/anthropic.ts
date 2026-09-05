import Anthropic from '@anthropic-ai/sdk';

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
 * Anthropic (Claude) 어댑터. 시스템 프롬프트에 cache_control — tools→system 순서로
 * 렌더되므로 breakpoint 하나로 tool 목록까지 캐시된다. 웹 검색은 서버 측 web_search 도구.
 *
 * 확인 카드(pelican tool_confirmation): 큐를 앞에서부터 실행하다 카드가 나오면 멈추고,
 * 남은 큐·모아둔 결과·메시지 전체를 native 로 돌려준다. 재개는 같은 상태에서 이어 돈다.
 * ⚠ tool_result 플러시는 큐 처리 바깥이어야 한다 — 재개 때 큐가 비어 있고 결과만 남는데,
 *   안쪽에 두면 그 결과가 영영 전송되지 않아 tool_use 짝이 없다고 API 가 400 을 낸다 (원본 주석).
 */

interface QueuedTool {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface NativeState {
  messages: Anthropic.MessageParam[];
  results: Anthropic.ToolResultBlockParam[];
  queue: QueuedTool[];
}

export class AnthropicAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  runTurn(request: TurnRequest): Promise<TurnOutcome> {
    const messages: Anthropic.MessageParam[] = [
      ...request.history.map((turn) => ({ role: turn.role, content: turn.text }) as Anthropic.MessageParam),
      { role: 'user', content: [{ type: 'text', text: request.userText }] },
    ];
    return this.loop({ messages, results: [], queue: [] }, request);
  }

  resumeTurn(native: unknown, resolved: ResolvedTool, request: TurnRequest): Promise<TurnOutcome> {
    const state = native as NativeState;
    state.results.push({
      type: 'tool_result',
      tool_use_id: resolved.toolUseId,
      content: resolved.content,
      ...(resolved.isError ? { is_error: true } : {}),
    });
    return this.loop(state, request, [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: resolved.toolUseId, content: resolved.content, ...(resolved.isError ? { is_error: true } : {}) }] },
    ]);
  }

  private async loop(state: NativeState, request: TurnRequest, record: RecordMessage[] = []): Promise<TurnOutcome> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    let emittedText = false;

    const tools: Anthropic.Messages.ToolUnion[] = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    }));
    if (request.webSearch) {
      //  구세대(하이쿠)는 기본형만 받는다
      const type = this.model.startsWith('claude-haiku') ? 'web_search_20250305' : 'web_search_20260209';
      tools.push({ type, name: 'web_search', max_uses: 3 } as unknown as Anthropic.Messages.ToolUnion);
    }

    for (let iteration = 0; iteration < request.maxIterations; iteration++) {
      // 1) 대기 중인 tool 부터 비운다 — 카드가 나오면 여기서 멈춘다
      const resultRecord: RecordBlock[] = [];
      while (state.queue.length > 0) {
        const use = state.queue[0];
        request.onToolStart(use.name);
        const result = await request.runTool(use.name, use.input);
        state.queue.shift();
        if ('card' in result) {
          if (resultRecord.length > 0) record.push({ role: 'user', content: resultRecord });
          return {
            record,
            usage,
            emittedText,
            pending: { toolUseId: use.id, tool: use.name, input: use.input, card: result.card, native: state },
          };
        }
        state.results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        });
        resultRecord.push({ type: 'tool_result', tool_use_id: use.id, content: result.content, ...(result.isError ? { is_error: true } : {}) });
      }
      if (resultRecord.length > 0) record.push({ role: 'user', content: resultRecord });

      // 2) 모아둔 결과를 보낸다 (큐 처리 바깥 — 상단 주석)
      if (state.results.length > 0) {
        state.messages.push({ role: 'user', content: state.results });
        state.results = [];
      }

      let response: Anthropic.Message;
      try {
        const stream = client.messages.stream(
          {
            model: this.model,
            max_tokens: 8192,
            system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
            tools,
            messages: state.messages,
          },
          { signal: request.signal },
        );
        stream.on('text', (delta) => {
          emittedText = true;
          request.onText(delta);
        });
        response = await stream.finalMessage();
      } catch (error) {
        if (request.signal.aborted) throw error;
        const status = error instanceof Anthropic.APIError ? (typeof error.status === 'number' ? error.status : null) : null;
        throw new ProviderApiError(status, error instanceof Error ? error.message : String(error), emittedText);
      }

      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      //  루프 계속용은 네이티브 그대로 (thinking·server_tool 블록 보존이 규칙이다)
      state.messages.push({ role: 'assistant', content: response.content });

      const assistantRecord: RecordBlock[] = [];
      for (const block of response.content) {
        if (block.type === 'text' && block.text) assistantRecord.push({ type: 'text', text: block.text });
        if (block.type === 'tool_use') {
          assistantRecord.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> });
        }
        if (block.type === 'server_tool_use' && block.name === 'web_search') {
          const query = (block.input as { query?: string } | null)?.query ?? '';
          assistantRecord.push({ type: 'web_search', query });
          request.onToolStart('web_search');
        }
      }
      if (assistantRecord.length > 0) record.push({ role: 'assistant', content: assistantRecord });

      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') break;

      state.queue = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({ id: block.id, name: block.name, input: block.input as Record<string, unknown> }));
    }

    return { record, usage, emittedText };
  }
}

import Anthropic from '@anthropic-ai/sdk';

import { type ProviderAdapter, ProviderApiError, type RecordBlock, type RecordMessage, type TurnOutcome, type TurnRequest } from './types';

/**
 * Anthropic (Claude) 어댑터. 시스템 프롬프트에 cache_control — tools→system 순서로
 * 렌더되므로 breakpoint 하나로 tool 목록까지 캐시된다. 웹 검색은 서버 측 web_search 도구.
 */
export class AnthropicAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async runTurn(request: TurnRequest): Promise<TurnOutcome> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const record: RecordMessage[] = [];
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

    const messages: Anthropic.MessageParam[] = [
      ...request.history.map((turn) => ({ role: turn.role, content: turn.text }) as Anthropic.MessageParam),
      { role: 'user', content: [{ type: 'text', text: request.userText }] },
    ];

    for (let iteration = 0; iteration < request.maxIterations; iteration++) {
      let response: Anthropic.Message;
      try {
        const stream = client.messages.stream(
          {
            model: this.model,
            max_tokens: 8192,
            system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
            tools,
            messages,
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
      messages.push({ role: 'assistant', content: response.content });

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

      const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = [];
      const resultRecord: RecordBlock[] = [];
      for (const toolUse of toolUses) {
        request.onToolStart(toolUse.name);
        const result = await request.runTool(toolUse.name, toolUse.input as Record<string, unknown>);
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        });
        resultRecord.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result.content, ...(result.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
      record.push({ role: 'user', content: resultRecord });
    }

    return { record, usage, emittedText };
  }
}

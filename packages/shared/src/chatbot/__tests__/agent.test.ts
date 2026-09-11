import { afterEach, describe, expect, it, vi } from 'vitest';

import { functionAgent } from '../agent';
import { type AgentChatMode, registerAgentChatMode } from '../agentBridge';

const data = {
  userId: 7,
  senderNickname: '매니저A',
  senderChannelId: 'm'.repeat(32),
  senderRole: 'MANAGER' as const,
  content: '!에이전트 대기열 비워줘',
  query: { command: '에이전트' },
  chzzk: {},
} as unknown as Parameters<typeof functionAgent.agentChat>[1];
const ctx = {} as Parameters<typeof functionAgent.agentChat>[0];

function registerMode() {
  const mode: AgentChatMode = {
    start: vi.fn().mockResolvedValue({ ok: true, message: '요청을 확인하고 있습니다…' }),
    relay: vi.fn().mockResolvedValue({ active: true }),
  };
  registerAgentChatMode(mode);
  return mode;
}

describe('!에이전트 핸들러 — 발화자 기준 세션 (#262)', () => {
  afterEach(() => registerAgentChatMode(null as unknown as AgentChatMode));

  it('부른 사람(채널 id·닉네임)과 요청을 start 에 넘긴다 — 채널 소유자는 userId 로', async () => {
    const mode = registerMode();
    await expect(functionAgent.agentChat(ctx, data)).resolves.toEqual({ ok: true, message: '요청을 확인하고 있습니다…' });
    expect(mode.start).toHaveBeenCalledWith({
      userId: 7,
      sender: { channelId: 'm'.repeat(32), nickname: '매니저A' },
      request: '대기열 비워줘',
    });
  });

  it('요청 없이 부르면 request 는 null, 채널 id 가 없으면 닉네임으로 대신한다', async () => {
    const mode = registerMode();
    await functionAgent.agentChat(ctx, { ...data, content: '!에이전트', senderChannelId: undefined });
    expect(mode.start).toHaveBeenCalledWith({
      userId: 7,
      sender: { channelId: '매니저A', nickname: '매니저A' },
      request: null,
    });
  });

  it('api 가 구현을 등록하지 않았으면 사용 불가 안내', async () => {
    await expect(functionAgent.agentChat(ctx, data)).resolves.toMatchObject({ ok: true, message: expect.stringContaining('사용할 수 없습니다') });
  });
});

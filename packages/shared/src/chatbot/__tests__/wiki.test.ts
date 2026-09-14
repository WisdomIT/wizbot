import { afterEach, describe, expect, it, vi } from 'vitest';

import { functionWiki } from '../wiki';
import { registerWikiAnswerMode, type WikiAnswerMode } from '../wikiBridge';

const base = {
  userId: 7,
  senderNickname: '시청자A',
  senderChannelId: 'v'.repeat(32),
  senderRole: 'VIEWER' as const,
  query: { command: '봉누도', option: '1' },
  chzzk: {},
};
const ctx = {} as Parameters<typeof functionWiki.wikiAnswer>[0];
const data = (content: string, option: string | null = '1') => ({ ...base, content, query: { command: '봉누도', option } }) as unknown as Parameters<typeof functionWiki.wikiAnswer>[1];

describe('!위키 핸들러 (#309)', () => {
  afterEach(() => registerWikiAnswerMode(null));

  it('명령어 뒤 전체가 질문 — 공백으로 쪼개지 않고, 발화자·소스와 함께 브리지에 넘긴다', async () => {
    const mode: WikiAnswerMode = { answer: vi.fn().mockResolvedValue({ ok: true, message: '전당포에서 삽니다.', messages: ['출처: 낚시 https://x/낚시'] }) };
    registerWikiAnswerMode(mode);
    await expect(functionWiki.wikiAnswer(ctx, data('!봉누도 낚싯대는 어디서 사?  '))).resolves.toEqual({
      ok: true,
      message: '전당포에서 삽니다.',
      messages: ['출처: 낚시 https://x/낚시'],
    });
    expect(mode.answer).toHaveBeenCalledWith({ userId: 7, sourceId: 1, question: '낚싯대는 어디서 사?', sender: { channelId: 'v'.repeat(32), nickname: '시청자A', role: 'VIEWER' } });
  });

  it('질문이 없으면 용법 안내(USAGE_ERROR), 200자 넘으면 거절 — 브리지를 부르지 않는다', async () => {
    const mode: WikiAnswerMode = { answer: vi.fn() };
    registerWikiAnswerMode(mode);
    await expect(functionWiki.wikiAnswer(ctx, data('!봉누도'))).resolves.toMatchObject({ ok: true, usageError: true, message: expect.stringContaining('예) !봉누도') });
    await expect(functionWiki.wikiAnswer(ctx, data(`!봉누도 ${'가'.repeat(201)}`))).resolves.toMatchObject({ usageError: true, message: '질문은 200자까지입니다.' });
    expect(mode.answer).not.toHaveBeenCalled();
  });

  it('소스 옵션이 없거나 브리지가 미등록이면 안내', async () => {
    await expect(functionWiki.wikiAnswer(ctx, data('!봉누도 질문', null))).resolves.toMatchObject({ message: expect.stringContaining('위키가 연결되어 있지') });
    await expect(functionWiki.wikiAnswer(ctx, data('!봉누도 질문'))).resolves.toMatchObject({ message: expect.stringContaining('사용할 수 없습니다') });
  });
});

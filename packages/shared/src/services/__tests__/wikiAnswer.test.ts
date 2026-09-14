import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginAnswer,
  cachedAnswer,
  chunkPage,
  endAnswer,
  guardAnswer,
  markAnswered,
  normalizeQuestion,
  resetAnswerState,
  searchChunks,
  tokenize,
} from '../wiki';

const NOW = new Date('2026-09-15T03:00:00Z'); // 한국 시간 12:00
const SOURCE = { id: 1, viewerCooldownMinutes: 30, perChannelDaily: 200, globalDaily: 2000 };

describe('청크·검색 (#309)', () => {
  it('소제목 경계로 자르고 heading 에 제목 › 소제목을 남긴다', () => {
    const chunks = chunkPage({ id: 1, url: 'u', title: '낚시', content: '# 낚시\n개요문\n## 2. 준비\n낚싯대는 전당포에서 삽니다.\n### 3. 진행\n물가에서 사용' });
    expect(chunks.map((c) => [c.heading, c.text])).toEqual([
      ['낚시', '개요문'],
      ['낚시 › 2. 준비', '낚싯대는 전당포에서 삽니다.'],
      ['낚시 › 3. 진행', '물가에서 사용'],
    ]);
  });

  it('토큰 — 어절 + 한글 2글자 조각(조사가 붙어도 맞게)', () => {
    expect(tokenize('낚싯대는 어디서 사?')).toEqual(expect.arrayContaining(['낚싯대는', '낚싯', '싯대', '대는', '어디서', '어디', '디서', '사']));
  });

  it('질문과 겹치는 청크를 점수순으로, 소제목이 맞으면 가중', () => {
    const chunks = [
      ...chunkPage({ id: 1, url: 'u1', title: '낚시', content: '## 준비\n낚싯대는 샌디쇼어와 전당포에서 구매할 수 있습니다.' }),
      ...chunkPage({ id: 2, url: 'u2', title: '벌목', content: '## 준비\n도끼는 철물점에서 구매합니다.' }),
      ...chunkPage({ id: 3, url: 'u3', title: '상점', content: '## 전당포\n전당포는 잡화를 팝니다.' }),
    ];
    const hits = searchChunks(chunks, '낚싯대 어디서 사?');
    expect(hits[0]?.title).toBe('낚시');
    expect(searchChunks(chunks, '???')).toEqual([]);
  });
});

describe('한도·쿨타임·캐시', () => {
  beforeEach(() => resetAnswerState());
  const db = (channelUsed: number, globalUsed: number) => {
    const count = vi.fn().mockImplementation(async ({ where }: { where: { userId?: number } }) => (where.userId ? channelUsed : globalUsed));
    return { prisma: { agentUsage: { count } } as unknown as PrismaClient, count };
  };

  it('처음엔 통과, 답변 뒤에는 같은 시청자만 쿨타임(남은 분 안내), 다른 시청자·다른 채널은 통과', async () => {
    const { prisma } = db(0, 0);
    await expect(guardAnswer(prisma, SOURCE, { userId: 7, senderChannelId: 'v1' }, NOW)).resolves.toEqual({ ok: true });
    markAnswered(SOURCE, { userId: 7, senderChannelId: 'v1', question: '낚싯대?' }, { message: 'a' }, NOW);
    const later = new Date(NOW.getTime() + 10 * 60_000);
    await expect(guardAnswer(prisma, SOURCE, { userId: 7, senderChannelId: 'v1' }, later)).resolves.toEqual({ ok: false, message: '20분 뒤에 다시 물어봐 주세요.' });
    await expect(guardAnswer(prisma, SOURCE, { userId: 7, senderChannelId: 'v2' }, later)).resolves.toEqual({ ok: true });
    await expect(guardAnswer(prisma, SOURCE, { userId: 8, senderChannelId: 'v1' }, later)).resolves.toEqual({ ok: true });
    await expect(guardAnswer(prisma, SOURCE, { userId: 7, senderChannelId: 'v1' }, new Date(NOW.getTime() + 31 * 60_000))).resolves.toEqual({ ok: true });
  });

  it('일일 상한 — 한국 시간 오늘 자정 기준으로 세고, 0 이면 무제한. 전체 상한 도달 순간에만 알림 표시', async () => {
    const { prisma, count } = db(200, 0);
    await expect(guardAnswer(prisma, SOURCE, { userId: 7, senderChannelId: 'v' }, NOW)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('이 채널의 질문 한도') });
    expect(count.mock.calls[0][0].where).toEqual({ userId: 7, entryName: 'wiki', createdAt: { gte: new Date('2026-09-14T15:00:00Z') } });
    await expect(guardAnswer(prisma, { ...SOURCE, perChannelDaily: 0 }, { userId: 7, senderChannelId: 'v' }, NOW)).resolves.toEqual({ ok: true });

    const global = db(0, 2000);
    await expect(guardAnswer(global.prisma, SOURCE, { userId: 7, senderChannelId: 'v' }, NOW)).resolves.toMatchObject({ ok: false, notify: 'global-limit' });
    const over = db(0, 2001);
    await expect(guardAnswer(over.prisma, SOURCE, { userId: 7, senderChannelId: 'v' }, NOW)).resolves.toMatchObject({ ok: false, notify: undefined });
  });

  it('동시 처리 — 채널당 1건, 전체 4건', async () => {
    const { prisma } = db(0, 0);
    beginAnswer(7);
    await expect(guardAnswer(prisma, SOURCE, { userId: 7, senderChannelId: 'v' }, NOW)).resolves.toMatchObject({ ok: false, message: expect.stringContaining('다른 질문을 처리') });
    await expect(guardAnswer(prisma, SOURCE, { userId: 8, senderChannelId: 'v' }, NOW)).resolves.toEqual({ ok: true });
    endAnswer(7);
    for (const id of [1, 2, 3, 4]) beginAnswer(id);
    await expect(guardAnswer(prisma, SOURCE, { userId: 9, senderChannelId: 'v' }, NOW)).resolves.toMatchObject({ ok: false });
  });

  it('같은 질문(공백·물음표 무시)은 10분 캐시, 소스·채널별', () => {
    markAnswered(SOURCE, { userId: 7, senderChannelId: 'v', question: '낚싯대 어디서 사?' }, { message: '전당포', messages: ['출처'] }, NOW);
    expect(normalizeQuestion('낚싯대  어디서 사??')).toBe('낚싯대 어디서 사');
    expect(cachedAnswer(1, 7, '낚싯대 어디서 사', NOW)).toEqual({ message: '전당포', messages: ['출처'] });
    expect(cachedAnswer(1, 8, '낚싯대 어디서 사', NOW)).toBeNull();
    expect(cachedAnswer(1, 7, '낚싯대 어디서 사', new Date(NOW.getTime() + 11 * 60_000))).toBeNull();
  });
});

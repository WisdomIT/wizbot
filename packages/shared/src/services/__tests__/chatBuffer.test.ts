import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRecentChat,
  findRecentChatBySender,
  getRecentChat,
  pushRecentChat,
  RECENT_CHAT_WINDOW_MS,
  type RecentChatEntry,
} from '../chatBuffer';

const USER_ID = 1;

function entry(overrides: Partial<RecentChatEntry> = {}): RecentChatEntry {
  return {
    at: 1_000_000,
    senderChannelId: 'viewer1',
    nickname: '시청자',
    role: 'VIEWER',
    content: '안녕하세요',
    chatChannelId: 'N2dODq',
    messageTime: 1_000_000,
    ...overrides,
  };
}

describe('최근 채팅 버퍼 (#248)', () => {
  beforeEach(() => clearRecentChat());

  it('넣은 순서대로 돌려주고 채널별로 격리된다', () => {
    pushRecentChat(USER_ID, [entry({ content: 'a' }), entry({ content: 'b' })], 1_000_000);
    pushRecentChat(2, [entry({ content: '다른 채널' })], 1_000_000);
    expect(getRecentChat(USER_ID, 150, 1_000_000).map((e) => e.content)).toEqual(['a', 'b']);
    expect(getRecentChat(2, 150, 1_000_000)).toHaveLength(1);
  });

  it('3분이 지난 채팅은 버린다', () => {
    pushRecentChat(USER_ID, [entry({ at: 1_000_000, content: '옛날' })], 1_000_000);
    pushRecentChat(
      USER_ID,
      [entry({ at: 1_000_000 + RECENT_CHAT_WINDOW_MS, content: '지금' })],
      1_000_000 + RECENT_CHAT_WINDOW_MS,
    );
    const result = getRecentChat(USER_ID, 150, 1_000_000 + RECENT_CHAT_WINDOW_MS + 1);
    expect(result.map((e) => e.content)).toEqual(['지금']);
  });

  it('limit 은 최신 쪽부터 자른다', () => {
    pushRecentChat(
      USER_ID,
      [entry({ content: '1' }), entry({ content: '2' }), entry({ content: '3' })],
      1_000_000,
    );
    expect(getRecentChat(USER_ID, 2, 1_000_000).map((e) => e.content)).toEqual(['2', '3']);
  });

  it('findRecentChatBySender 는 해당 시청자의 채팅만 찾는다', () => {
    pushRecentChat(
      USER_ID,
      [
        entry({ senderChannelId: 'viewer1', content: 'a' }),
        entry({ senderChannelId: 'viewer2', content: 'b' }),
        entry({ senderChannelId: 'viewer1', content: 'c' }),
      ],
      1_000_000,
    );
    const found = findRecentChatBySender(USER_ID, 'viewer1', 1_000_000);
    expect(found.map((e) => e.content)).toEqual(['a', 'c']);
    expect(findRecentChatBySender(USER_ID, 'nobody', 1_000_000)).toEqual([]);
  });
});

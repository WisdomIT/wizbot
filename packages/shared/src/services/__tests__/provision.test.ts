import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTokensMock = vi.fn();
vi.mock('../chzzkClient', () => ({
  getChzzkClientForUser: vi.fn(() => ({ auth: { setTokens: setTokensMock } })),
}));
vi.mock('../songFavorite', () => ({ importPlaylist: vi.fn() }));
vi.mock('../youtube', () => ({
  searchVideo: vi.fn().mockResolvedValue(null),
  extractPlaylistId: vi.fn((input: string) => (input.includes('list=') ? 'PL123' : null)),
}));

import { importPlaylist } from '../songFavorite';
import { searchVideo } from '../youtube';
import { provisionStreamer, setDefaultPlaylistUrl } from '../provision';

const IDENTITY = { channelId: 'c'.repeat(32), channelName: '테스터', channelImageUrl: null };
const initialCommands = (userId: number) => ({
  initialFunction: [{ userId, permission: 'MANAGER' as const, command: '추가', function: 'createCommandEcho' }],
  initialEcho: [{ userId, command: '테스트', response: '챗봇 명령어 테스트입니다' }],
});

function createPrisma() {
  const user = { upsert: vi.fn().mockResolvedValue({ id: 42, ...IDENTITY }) };
  const userSetting = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() };
  const chatbotFunctionCommand = { findFirst: vi.fn().mockResolvedValue(null), createMany: vi.fn() };
  const chatbotEchoCommand = { createMany: vi.fn() };
  const songFavorite = {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 7, ...data })),
  };
  const songFavoriteItem = { create: vi.fn() };
  const siteSetting = { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn(), deleteMany: vi.fn() };
  const prisma = { user, userSetting, chatbotFunctionCommand, chatbotEchoCommand, songFavorite, songFavoriteItem, siteSetting };
  return { prisma: prisma as unknown as PrismaClient, ...prisma };
}

describe('provisionStreamer — 인터락과 신청 승인이 공유하는 계정 프로비저닝 (#151)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('첫 로그인: User·UserSetting·토큰·기본 명령어를 만든다', async () => {
    const { prisma, userSetting, chatbotFunctionCommand, chatbotEchoCommand } = createPrisma();
    const tokens = { accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer', expiresIn: 1, obtainedAt: 0 };
    const user = await provisionStreamer(prisma, IDENTITY, { tokens, initialCommands });
    expect(user.id).toBe(42);
    expect(userSetting.create).toHaveBeenCalledWith({ data: { userId: 42 } });
    expect(setTokensMock).toHaveBeenCalledWith(tokens);
    expect(chatbotFunctionCommand.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ userId: 42, command: '추가' })] });
    expect(chatbotEchoCommand.createMany).toHaveBeenCalled();
  });

  it('멱등: 설정·명령어·즐겨찾기가 이미 있으면 만들지 않고, 토큰이 없으면 저장하지 않는다', async () => {
    const { prisma, userSetting, chatbotFunctionCommand, songFavorite } = createPrisma();
    userSetting.findFirst.mockResolvedValue({ id: 1 });
    chatbotFunctionCommand.findFirst.mockResolvedValue({ id: 1 });
    songFavorite.findFirst.mockResolvedValue({ id: 1 });
    await provisionStreamer(prisma, IDENTITY, { tokens: null, initialCommands });
    expect(userSetting.create).not.toHaveBeenCalled();
    expect(chatbotFunctionCommand.createMany).not.toHaveBeenCalled();
    expect(songFavorite.create).not.toHaveBeenCalled();
    expect(setTokensMock).not.toHaveBeenCalled();
  });
});

describe('기본 즐겨찾기 「위즈 추천 플레이리스트」 (#246)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchVideo).mockResolvedValue(null);
  });

  it('설정된 재생목록을 대표 즐겨찾기로 가져온다', async () => {
    const { prisma, songFavorite, siteSetting } = createPrisma();
    siteSetting.findUnique.mockResolvedValue({ key: 'defaultPlaylistUrl', value: 'https://youtube.com/playlist?list=PL1' });
    vi.mocked(importPlaylist).mockResolvedValue({ playlistTitle: 'x', added: 3, skipped: 0, truncated: false });

    await provisionStreamer(prisma, IDENTITY, { tokens: null, initialCommands });

    expect(songFavorite.create).toHaveBeenCalledWith({
      data: { userId: 42, name: '위즈 추천 플레이리스트', isDefault: true },
    });
    expect(importPlaylist).toHaveBeenCalledWith(prisma, 42, 7, 'https://youtube.com/playlist?list=PL1');
    expect(searchVideo).not.toHaveBeenCalled();
  });

  it('재생목록이 없거나 가져오기에 실패하면 인기순 검색 한 곡으로 폴백한다', async () => {
    const { prisma, songFavoriteItem, siteSetting } = createPrisma();
    siteSetting.findUnique.mockResolvedValue({ key: 'defaultPlaylistUrl', value: 'https://youtube.com/playlist?list=PL1' });
    vi.mocked(importPlaylist).mockRejectedValue(new Error('quota'));
    vi.mocked(searchVideo).mockResolvedValue({
      youtubeId: 'a'.repeat(11), title: '인기곡', uploader: '가수', durationSeconds: 200, thumbnailUrl: null,
    });

    await provisionStreamer(prisma, IDENTITY, { tokens: null, initialCommands });

    expect(searchVideo).toHaveBeenCalledWith('노래', { sortBy: 'popularity' });
    expect(songFavoriteItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ favoriteId: 7, youtubeId: 'a'.repeat(11), order: 0 }),
    });
  });

  it('유튜브가 전부 실패해도 프로비저닝은 성공한다', async () => {
    const { prisma, songFavorite } = createPrisma();
    vi.mocked(searchVideo).mockRejectedValue(new Error('down'));
    const user = await provisionStreamer(prisma, IDENTITY, { tokens: null, initialCommands });
    expect(user.id).toBe(42);
    expect(songFavorite.create).toHaveBeenCalled();
  });
});

describe('setDefaultPlaylistUrl (#246)', () => {
  it('재생목록 주소가 아니면 거부한다', async () => {
    const { prisma } = createPrisma();
    await expect(setDefaultPlaylistUrl(prisma, 'https://example.com/x')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('빈 값이면 설정을 지운다 — 폴백(인기 곡)만 쓰게 된다', async () => {
    const { prisma, siteSetting } = createPrisma();
    await expect(setDefaultPlaylistUrl(prisma, '  ')).resolves.toEqual({ url: '' });
    expect(siteSetting.deleteMany).toHaveBeenCalledWith({ where: { key: 'defaultPlaylistUrl' } });
  });
});

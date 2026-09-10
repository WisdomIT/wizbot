import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTokensMock = vi.fn();
const channelsGetMock = vi.fn();
vi.mock('../chzzkClient', () => ({
  getChzzkClientForUser: vi.fn(() => ({ auth: { setTokens: setTokensMock } })),
  getChzzkAppClient: vi.fn(() => ({ channels: { get: channelsGetMock } })),
}));
vi.mock('../notify', () => ({ notifyAdmins: vi.fn().mockResolvedValue({ mailSent: true, discordSent: true }) }));
vi.mock('../songFavorite', () => ({ importPlaylist: vi.fn() }));
vi.mock('../youtube', () => ({
  searchVideo: vi.fn().mockResolvedValue(null),
  extractPlaylistId: vi.fn((input: string) => (input.includes('list=') ? 'PL123' : null)),
}));

import { notifyAdmins } from '../notify';
import { fetchFollowerCount, provisionStreamer, setDefaultPlaylistUrl } from '../provision';
import { importPlaylist } from '../songFavorite';
import { searchVideo } from '../youtube';

const IDENTITY = { channelId: 'c'.repeat(32), channelName: '테스터', channelImageUrl: null };
const initialCommands = (userId: number) => ({
  initialFunction: [{ userId, permission: 'MANAGER' as const, command: '추가', function: 'createCommandEcho' }],
  initialEcho: [{ userId, command: '테스트', response: '챗봇 명령어 테스트입니다' }],
});
const OPTIONS = { tokens: null, initialCommands, joinedVia: 'WHITELIST' as const };

function createPrisma() {
  //  기본은 새 계정 — findUnique 가 null 이면 create 로 간다 (#271)
  const user = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 42, followerCount: null, hidden: false, ...data })),
    update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 42, ...IDENTITY, ...data })),
  };
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
    const user = await provisionStreamer(prisma, IDENTITY, { ...OPTIONS, tokens });
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
    await provisionStreamer(prisma, IDENTITY, OPTIONS);
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

    await provisionStreamer(prisma, IDENTITY, OPTIONS);

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

    await provisionStreamer(prisma, IDENTITY, OPTIONS);

    expect(searchVideo).toHaveBeenCalledWith('노래', { sortBy: 'popularity' });
    expect(songFavoriteItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ favoriteId: 7, youtubeId: 'a'.repeat(11), order: 0 }),
    });
  });

  it('유튜브가 전부 실패해도 프로비저닝은 성공한다', async () => {
    const { prisma, songFavorite } = createPrisma();
    vi.mocked(searchVideo).mockRejectedValue(new Error('down'));
    const user = await provisionStreamer(prisma, IDENTITY, OPTIONS);
    expect(user.id).toBe(42);
    expect(songFavorite.create).toHaveBeenCalled();
  });
});

describe('신규 등록 알림 + 팔로워 기준 기본 공개 (#271)', () => {
  beforeEach(() => vi.clearAllMocks());

  /** siteSetting.findUnique 를 키별로 — 재생목록은 없음, 기준값만 준다 */
  function withThreshold(prisma: ReturnType<typeof createPrisma>, value: string | null) {
    prisma.siteSetting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key === 'signup.publicFollowerThreshold' && value !== null ? { key: where.key, value } : null,
    );
  }

  it('새 계정: 팔로워가 기준 미만이면 숨김으로 만들고 STREAMER_JOINED 알림을 보낸다', async () => {
    const created = createPrisma();
    withThreshold(created, '100');
    await provisionStreamer(created.prisma, { ...IDENTITY, followerCount: 30 }, { ...OPTIONS, joinedVia: 'AUTO_APPROVE' });

    expect(created.user.create).toHaveBeenCalledWith({ data: { ...IDENTITY, followerCount: 30, hidden: true } });
    expect(created.user.update).not.toHaveBeenCalled();
    expect(notifyAdmins).toHaveBeenCalledWith(
      created.prisma,
      'STREAMER_JOINED',
      expect.objectContaining({
        title: '신규 스트리머 등록: 테스터',
        link: { label: '스트리머 관리', url: '/admin/streamers' },
        fields: expect.arrayContaining([
          { name: '팔로워', value: '30' },
          { name: '경로', value: '자동 승인' },
          { name: '목록 공개', value: '숨김 (팔로워 기준 미만)' },
        ]),
      }),
    );
  });

  it('기준 이상이면 공개, 설정이 없으면 기본 100, 0 이면 전부 공개', async () => {
    const a = createPrisma();
    withThreshold(a, null);
    await provisionStreamer(a.prisma, { ...IDENTITY, followerCount: 100 }, OPTIONS);
    expect(a.user.create.mock.calls[0][0].data.hidden).toBe(false);

    const b = createPrisma();
    withThreshold(b, null);
    await provisionStreamer(b.prisma, { ...IDENTITY, followerCount: 99 }, OPTIONS);
    expect(b.user.create.mock.calls[0][0].data.hidden).toBe(true);

    const c = createPrisma();
    withThreshold(c, '0');
    await provisionStreamer(c.prisma, { ...IDENTITY, followerCount: 0 }, OPTIONS);
    expect(c.user.create.mock.calls[0][0].data.hidden).toBe(false);
  });

  it('팔로워 수를 모르면 공개로 만들고 followerCount 는 쓰지 않는다', async () => {
    const { prisma, user } = createPrisma();
    await provisionStreamer(prisma, IDENTITY, OPTIONS);
    expect(user.create).toHaveBeenCalledWith({ data: { ...IDENTITY, hidden: false } });
    expect(notifyAdmins).toHaveBeenCalledWith(prisma, 'STREAMER_JOINED', expect.objectContaining({
      fields: expect.arrayContaining([{ name: '팔로워', value: '(알 수 없음)' }, { name: '목록 공개', value: '공개' }]),
    }));
  });

  it('기존 계정: 프로필·팔로워 수만 갱신하고 알림은 없다 — 모르면 기존 값을 지우지 않는다', async () => {
    const { prisma, user } = createPrisma();
    user.findUnique.mockResolvedValue({ id: 42, ...IDENTITY, followerCount: 500, hidden: false });

    await provisionStreamer(prisma, { ...IDENTITY, channelName: '새이름', followerCount: 520 }, OPTIONS);
    expect(user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { channelName: '새이름', channelImageUrl: null, followerCount: 520 },
    });

    await provisionStreamer(prisma, { ...IDENTITY, channelName: '새이름' }, OPTIONS);
    expect(user.update.mock.calls[1][0].data).toEqual({ channelName: '새이름', channelImageUrl: null });
    expect(user.create).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('fetchFollowerCount 는 치지직 실패를 undefined 로 삼킨다 — 승인이 막히면 안 된다', async () => {
    channelsGetMock.mockResolvedValueOnce([{ channelId: IDENTITY.channelId, followerCount: 12 }]);
    await expect(fetchFollowerCount(IDENTITY.channelId)).resolves.toBe(12);
    channelsGetMock.mockRejectedValueOnce(new Error('down'));
    await expect(fetchFollowerCount(IDENTITY.channelId)).resolves.toBeUndefined();
    channelsGetMock.mockResolvedValueOnce([]);
    await expect(fetchFollowerCount(IDENTITY.channelId)).resolves.toBeUndefined();
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

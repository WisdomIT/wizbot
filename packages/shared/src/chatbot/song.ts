import { isServiceError, songService, userSettingService } from '../services';
import { Context } from '../trpc';
import { ChabotReturn, ChatbotFunctionHandler } from '.';
import { fitChatMessage, splitContent } from './lib';

/** 노래 명령 핸들러 (#5 #6 1단계) */

/** 서비스 계층의 정책 오류는 채팅 응답으로, 그 외는 디스패처 공통 처리로 */
async function withServiceMessages(fn: () => Promise<ChabotReturn>): Promise<ChabotReturn> {
  try {
    return await fn();
  } catch (error) {
    if (isServiceError(error)) return { ok: true, message: error.message };
    throw error;
  }
}

function requesterOf(data: { senderNickname: string; senderChannelId?: string }) {
  return { nickname: data.senderNickname, channelId: data.senderChannelId ?? null };
}

/**
 * 기능이 꺼져 있으면(#237) 안내 응답, 켜져 있으면 null.
 * 신청은 서비스 계층에서도 막지만, 삭제·목록·현재 곡도 채팅에서는 꺼졌다고 답해야 한다.
 */
async function inactiveMessage(ctx: Context, userId: number): Promise<ChabotReturn | null> {
  const setting = await userSettingService.getUserSetting(ctx.prisma, userId);
  return setting.songActive ? null : { ok: true, message: '노래 신청 기능이 꺼져 있습니다.' };
}

/**
 * 시청자 플레이리스트 링크 (` | https://…/<channelId>/playlist`).
 * 실행 시점에 조립해 경로 규칙(#72)·도메인 변경에 자동으로 따라간다. 미설정 시 빈 문자열.
 *
 * ⚠️ 이 한 줄이 71자다 — 채팅 한도 100자의 대부분을 먹는다 (#115).
 * 그래서 링크는 「노래 목록」에만 붙이고, 현재 곡 응답에는 목록 명령어만 안내한다.
 */
async function playlistLinkSuffix(ctx: Context, userId: number): Promise<string> {
  const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (!siteUrl) return '';

  const user = await ctx.prisma.user.findUnique({
    where: { id: userId },
    select: { channelId: true },
  });
  if (!user) return '';

  return ` | ${siteUrl}/${user.channelId}/playlist`;
}

/**
 * ` | !노래 목록` 안내.
 * 명령어 이름은 스트리머가 바꿀 수 있으므로 저장된 이름을 읽고,
 * 비활성이면(#82) 안내하지 않는다.
 */
async function listCommandSuffix(ctx: Context, userId: number): Promise<string> {
  const command = await ctx.prisma.chatbotFunctionCommand.findFirst({
    where: { userId, function: 'listSongs', enabled: true },
    select: { command: true },
  });

  return command ? ` | !${command.command}` : '';
}

export const functionSong = {
  requestSong: async (ctx, data) =>
    withServiceMessages(async () => {
      const [query] = splitContent(data.content, data.query.command, 1);

      if (!query) {
        return {
          ok: true,
          message: `신청할 곡을 입력해주세요. 예) !${data.query.command} LUCY 개화`,
        };
      }

      const { song, position } = await songService.requestSong(
        ctx.prisma,
        data.userId,
        query,
        requesterOf(data),
      );

      return {
        ok: true,
        message: fitChatMessage(`${position}번째로 신청되었습니다: `, song.title),
      };
    }),

  removeSong: async (ctx, data) =>
    withServiceMessages(async () => {
      const inactive = await inactiveMessage(ctx, data.userId);
      if (inactive) return inactive;

      const [rawPosition] = splitContent(data.content, data.query.command, 1);
      const canRemoveOthers = data.senderRole === 'MANAGER' || data.senderRole === 'STREAMER';

      let position: number | undefined;
      if (rawPosition) {
        // 시청자가 순번을 붙인 경우, 의도치 않은 곡 삭제를 막기 위해 본인 곡 취소로 처리하지 않는다
        if (!canRemoveOthers) {
          return { ok: true, message: '순번을 지정한 삭제는 매니저만 가능합니다.' };
        }
        const parsed = Number(rawPosition);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return {
            ok: true,
            message: `순번은 1 이상의 숫자로 입력해주세요. 예) !${data.query.command} 3`,
          };
        }
        position = parsed;
      }

      const removed = await songService.removeSong(ctx.prisma, data.userId, {
        position,
        requester: requesterOf(data),
        canRemoveOthers,
      });

      return { ok: true, message: fitChatMessage('삭제되었습니다: ', removed.title) };
    }),

  listSongs: async (ctx, data) =>
    withServiceMessages(async () => {
      const inactive = await inactiveMessage(ctx, data.userId);
      if (inactive) return inactive;

      const [queue, link] = await Promise.all([
        songService.listQueue(ctx.prisma, data.userId),
        playlistLinkSuffix(ctx, data.userId),
      ]);

      if (queue.length === 0) {
        return { ok: true, message: `대기열이 비어 있습니다.${link}` };
      }

      // 다음 곡 제목까지 넣으면 링크(71자)와 함께 한도를 넘는다 — 곡 수만 알린다 (#115)
      return { ok: true, message: `대기 ${queue.length}곡${link}` };
    }),

  currentSong: async (ctx, data) =>
    withServiceMessages(async () => {
      // 링크(71자) 대신 목록 명령어를 안내한다 — 제목에 쓸 자리를 남기기 위해 (#115)
      const [playback, listCommand, setting] = await Promise.all([
        ctx.prisma.songPlayback.findUnique({ where: { userId: data.userId } }),
        listCommandSuffix(ctx, data.userId),
        userSettingService.getUserSetting(ctx.prisma, data.userId),
      ]);

      if (!setting.songActive) {
        return { ok: true, message: '노래 신청 기능이 꺼져 있습니다.' };
      }

      if (!playback || playback.status === 'STOPPED' || !playback.title) {
        const queue = await songService.listQueue(ctx.prisma, data.userId);
        const waiting = queue.length > 0 ? ` | 대기 ${queue.length}곡` : '';
        return { ok: true, message: `재생 중인 곡이 없습니다.${waiting}` };
      }

      // 신청자는 넣지 않는다 — 제목이 잘리는 쪽이 손해가 크다
      return { ok: true, message: fitChatMessage('♪ ', playback.title, listCommand) };
    }),
} satisfies Partial<Record<string, ChatbotFunctionHandler>>;

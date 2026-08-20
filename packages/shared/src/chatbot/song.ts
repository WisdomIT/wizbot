import { isServiceError, songService, userSettingService } from '../services';
import { ChabotReturn, ChatbotFunctionHandler } from '.';
import { splitContent } from './lib';

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

      return { ok: true, message: `${position}번째로 신청되었습니다: ${song.title}` };
    }),

  removeSong: async (ctx, data) =>
    withServiceMessages(async () => {
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

      return { ok: true, message: `삭제되었습니다: ${removed.title}` };
    }),

  listSongs: async (ctx, data) =>
    withServiceMessages(async () => {
      const queue = await songService.listQueue(ctx.prisma, data.userId);

      if (queue.length === 0) {
        return { ok: true, message: '대기열이 비어 있습니다.' };
      }

      const next = queue[0];
      return {
        ok: true,
        message: `대기 ${queue.length}곡 | 다음 곡: ${next.title} (신청: ${next.requester})`,
      };
    }),

  currentSong: async (ctx, data) =>
    withServiceMessages(async () => {
      const [playback, user, setting] = await Promise.all([
        ctx.prisma.songPlayback.findUnique({ where: { userId: data.userId } }),
        ctx.prisma.user.findUnique({
          where: { id: data.userId },
          select: { channelId: true },
        }),
        userSettingService.getUserSetting(ctx.prisma, data.userId),
      ]);

      const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
      const link = siteUrl && user ? ` | ${siteUrl}/${user.channelId}/playlist` : '';

      if (!setting.songActive) {
        return { ok: true, message: `현재 노래 신청을 받지 않습니다.${link}` };
      }

      if (!playback || playback.status === 'STOPPED' || !playback.title) {
        const queue = await songService.listQueue(ctx.prisma, data.userId);
        const waiting = queue.length > 0 ? ` | 대기 ${queue.length}곡` : '';
        return { ok: true, message: `재생 중인 곡이 없습니다.${waiting}${link}` };
      }

      const requester = playback.requester ? ` (신청: ${playback.requester})` : '';
      return { ok: true, message: `♪ ${playback.title}${requester}${link}` };
    }),
} satisfies Partial<Record<string, ChatbotFunctionHandler>>;

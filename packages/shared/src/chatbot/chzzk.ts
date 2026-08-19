import { ChzzkClient } from 'chzzk';
import { ChzzkApiError, ChzzkTokenRefreshError } from 'chzzk-open-sdk';

import { getChzzkAppClient } from '../services';
import { ChabotReturn, ChatbotFunctionHandler } from '.';
import { formatDuration, splitContent } from './lib';

const chzzkUnofficialClient = new ChzzkClient();

/**
 * 치지직 API 오류를 채팅 응답 메시지로 정규화한다.
 * 그 외 예외는 디스패처의 공통 처리('Function execution failed')로 전파.
 */
async function withChzzkMessages(
  failMessage: string,
  fn: () => Promise<ChabotReturn>,
): Promise<ChabotReturn> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ChzzkTokenRefreshError) {
      return { ok: true, message: '치지직 연동이 만료되었습니다. 사이트에서 다시 로그인해주세요.' };
    }
    if (error instanceof ChzzkApiError) {
      return { ok: true, message: failMessage };
    }
    throw error;
  }
}

export const functionChzzk = {
  getChzzkTitle: async (ctx, data) =>
    withChzzkMessages('채널 설정을 가져오는 데 실패했습니다.', async () => {
      const { defaultLiveTitle } = await data.chzzk.lives.getSetting();
      return { ok: true, message: `제목: ${defaultLiveTitle}` };
    }),

  getChzzkCategory: async (ctx, data) =>
    withChzzkMessages('채널 설정을 가져오는 데 실패했습니다.', async () => {
      const { category } = await data.chzzk.lives.getSetting();
      if (!category) {
        return { ok: true, message: '설정된 카테고리가 없습니다.' };
      }
      return { ok: true, message: `카테고리: ${category.categoryValue}` };
    }),

  updateChzzkTitle: async (ctx, data) =>
    withChzzkMessages('채널 제목을 변경하는 데 실패했습니다.', async () => {
      const [title] = splitContent(data.content, data.query.command, 1);

      if (title === '') {
        return { ok: true, message: '변경할 제목을 입력해주세요.' };
      }

      await data.chzzk.lives.updateSetting({ defaultLiveTitle: title });
      return { ok: true, message: '채널 제목이 변경되었습니다.' };
    }),

  updateChzzkCategory: async (ctx, data) =>
    withChzzkMessages('채널 카테고리를 변경하는 데 실패했습니다.', async () => {
      const [categoryQuery] = splitContent(data.content, data.query.command, 1);

      if (categoryQuery === '') {
        return { ok: true, message: '변경할 카테고리를 입력해주세요.' };
      }

      const categories = await getChzzkAppClient().categories.search({ query: categoryQuery });
      if (categories.length === 0) {
        return { ok: true, message: '해당 카테고리를 찾을 수 없습니다.' };
      }

      const { categoryType, categoryId } = categories[0];
      await data.chzzk.lives.updateSetting({ categoryType, categoryId });
      return { ok: true, message: '채널 카테고리가 변경되었습니다.' };
    }),

  setChzzkNotice: async (ctx, data) =>
    withChzzkMessages('채널 공지사항을 변경하는 데 실패했습니다.', async () => {
      const [notice] = splitContent(data.content, data.query.command, 1);

      if (notice === '') {
        return { ok: true, message: '공지사항 내용을 입력해주세요.' };
      }

      await data.chzzk.chats.notice({ message: notice });
      return { ok: true, message: '채널 공지사항이 변경되었습니다.' };
    }),

  /*
    !! chzzk 비공식 라이브러리를 통한 조회 !!
    공식 OPEN API 에는 특정 채널의 라이브 상세(업타임/시청자 수) 조회가 없다.
    chzzk-open-sdk 로 대체 불가 — 유지 여부는 #30 PR2 에서 결정.
  */
  getChzzkUptime: async (ctx, data) => {
    const user = await ctx.prisma.user.findFirst({
      where: { id: data.userId },
      select: { channelId: true },
    });

    if (!user) {
      return { ok: false, message: '사용자를 찾을 수 없습니다.' };
    }

    const liveDetail = await chzzkUnofficialClient.live.detail(user.channelId);

    if (!liveDetail) {
      return { ok: true, message: '채널 정보를 가져오는 데 실패했습니다.' };
    }

    const { openDate, closeDate } = liveDetail;

    if (closeDate) {
      return { ok: true, message: '종료된 방송입니다.' };
    }

    const diff = new Date().getTime() - new Date(openDate).getTime();
    return { ok: true, message: `업타임: ${formatDuration(diff)}` };
  },

  getChzzkViewer: async (ctx, data) => {
    const user = await ctx.prisma.user.findFirst({
      where: { id: data.userId },
      select: { channelId: true },
    });

    if (!user) {
      return { ok: false, message: '사용자를 찾을 수 없습니다.' };
    }

    const liveDetail = await chzzkUnofficialClient.live.detail(user.channelId);

    if (!liveDetail) {
      return { ok: true, message: '채널 정보를 가져오는 데 실패했습니다.' };
    }

    return { ok: true, message: `현재 시청자 수: ${liveDetail.concurrentUserCount}명` };
  },
} satisfies Partial<Record<string, ChatbotFunctionHandler>>;

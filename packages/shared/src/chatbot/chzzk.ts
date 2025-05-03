import { ChzzkClient } from 'chzzk';

import chzzk from '../chzzk';
import { FunctionCommand } from '.';
import { formatDuration, splitContent } from './lib';

const chzzkClient = new ChzzkClient();

export const functionChzzk = {
  getChzzkTitle: async (ctx, data) => {
    const { accessToken } = data;
    const settingRequest = await chzzk.live.setting(accessToken);
    if (settingRequest.code !== 200) {
      return {
        ok: true,
        message: '채널 설정을 가져오는 데 실패했습니다.',
      };
    }

    const { defaultLiveTitle } = settingRequest.content;
    return {
      ok: true,
      message: defaultLiveTitle,
    };
  },
  getChzzkCategory: async (ctx, data) => {
    const { accessToken } = data;
    const settingRequest = await chzzk.live.setting(accessToken);
    if (settingRequest.code !== 200) {
      return {
        ok: true,
        message: '채널 설정을 가져오는 데 실패했습니다.',
      };
    }

    const { category } = settingRequest.content;
    return {
      ok: true,
      message: category.categoryValue,
    };
  },
  updateChzzkTitle: async (ctx, data) => {
    const { accessToken, content, query } = data;

    const splittedContent = splitContent(content, query.command, 1);
    const title = splittedContent[0];

    if (title === '') {
      return {
        ok: true,
        message: '변경할 제목을 입력해주세요.',
      };
    }

    const updateRequest = await chzzk.live.settingUpdate(accessToken, {
      defaultLiveTitle: title,
    });
    if (updateRequest.code !== 200) {
      return {
        ok: true,
        message: '채널 제목을 변경하는 데 실패했습니다.',
      };
    }

    return {
      ok: true,
      message: `채널 제목이 변경되었습니다.`,
    };
  },
  updateChzzkCategory: async (ctx, data) => {
    const { accessToken, content, query } = data;

    const splittedContent = splitContent(content, query.command, 1);
    const category = splittedContent[0];

    if (category === '') {
      return {
        ok: true,
        message: '변경할 카테고리를 입력해주세요.',
      };
    }

    const getCategory = await chzzk.category.search({ query: category });
    if (getCategory.code !== 200) {
      return {
        ok: true,
        message: '카테고리를 가져오는 데 실패했습니다.',
      };
    }
    if (getCategory.content.data.length === 0) {
      return {
        ok: true,
        message: '해당 카테고리를 찾을 수 없습니다.',
      };
    }

    const categoryType = getCategory.content.data[0].categoryType;
    const categoryId = getCategory.content.data[0].categoryId;

    const updateRequest = await chzzk.live.settingUpdate(accessToken, {
      categoryType,
      categoryId,
    });

    if (updateRequest.code !== 200) {
      return {
        ok: true,
        message: '채널 카테고리를 변경하는 데 실패했습니다.',
      };
    }

    return {
      ok: true,
      message: `채널 카테고리가 변경되었습니다.`,
    };
  },
  setChzzkNotice: async (ctx, data) => {
    const { accessToken, content, query } = data;

    const splittedContent = splitContent(content, query.command, 1);
    const notice = splittedContent[0];

    if (notice === '') {
      return {
        ok: true,
        message: '공지사항 내용을 입력해주세요.',
      };
    }

    const updateRequest = await chzzk.chat.notice(accessToken, {
      message: notice,
    });
    if (updateRequest.code !== 200) {
      return {
        ok: true,
        message: '채널 공지사항을 변경하는 데 실패했습니다.',
      };
    }

    return {
      ok: true,
      message: `채널 공지사항이 변경되었습니다.`,
    };
  },
  /* 
    !! chzzk 비공식 라이브러리를 통한 조회 !!
    TODO: 추후 공식 라이브러리로 변경
    - chzzk 라이브러리에서 제공하는 메서드가 대체 라이브러리로 구현
  */
  getChzzkUptime: async (ctx, data) => {
    const user = await ctx.prisma.user.findFirst({
      where: {
        id: data.userId,
      },
      select: {
        channelId: true,
      },
    });

    if (!user) {
      return {
        ok: false,
        message: '사용자를 찾을 수 없습니다.',
      };
    }

    const { channelId } = user;

    const liveDetail = await chzzkClient.live.detail(channelId);

    if (!liveDetail) {
      return {
        ok: true,
        message: '채널 정보를 가져오는 데 실패했습니다.',
      };
    }

    const { openDate, closeDate } = liveDetail;

    if (closeDate) {
      return {
        ok: true,
        message: `종료된 방송입니다.`,
      };
    }

    const diff = new Date().getTime() - new Date(openDate).getTime();

    return {
      ok: true,
      message: `업타임: ${formatDuration(diff)}`,
    };
  },
  getChzzkViewer: async (ctx, data) => {
    const user = await ctx.prisma.user.findFirst({
      where: {
        id: data.userId,
      },
      select: {
        channelId: true,
      },
    });

    if (!user) {
      return {
        ok: false,
        message: '사용자를 찾을 수 없습니다.',
      };
    }

    const { channelId } = user;

    const liveDetail = await chzzkClient.live.detail(channelId);

    if (!liveDetail) {
      return {
        ok: true,
        message: '채널 정보를 가져오는 데 실패했습니다.',
      };
    }

    const { concurrentUserCount } = liveDetail;

    return {
      ok: true,
      message: `현재 시청자 수: ${concurrentUserCount}`,
    };
  },
  /*
    !! chzzk 비공식 라이브러리 여기까지 !!
  */
} as FunctionCommand;

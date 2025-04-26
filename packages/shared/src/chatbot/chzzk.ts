import chzzk from '../chzzk';
import { FunctionCommand } from '.';
import { splitContent } from './lib';

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
    const { accessToken, content } = data;

    const splittedContent = splitContent(content, 1);
    const query = splittedContent[1];

    if (query === '') {
      return {
        ok: true,
        message: '변경할 제목을 입력해주세요.',
      };
    }

    const updateRequest = await chzzk.live.settingUpdate(accessToken, {
      defaultLiveTitle: query,
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
    const { accessToken, content } = data;

    const splittedContent = splitContent(content, 1);
    const query = splittedContent[1];

    if (query === '') {
      return {
        ok: true,
        message: '변경할 카테고리를 입력해주세요.',
      };
    }

    const getCategory = await chzzk.category.search({ query });
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
} as FunctionCommand;

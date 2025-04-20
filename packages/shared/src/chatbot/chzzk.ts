import chzzk from '../chzzk';
import { FunctionCommand } from '.';

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
} as FunctionCommand;

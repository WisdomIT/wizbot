import { http } from '../../lib/http';
import { ACCESS_TOKEN_HEADERS, CHZZK_URI } from './chzzk.config';
import {
  ChzzkApiResponse,
  ChzzkChatsNoticeRequest,
  ChzzkChatsSendRequest,
  ChzzkChatsSendResponse,
  ChzzkChatsSettingsPut,
  ChzzkChatsSettingsResponse,
} from './index.d';

export function send(
  token: string,
  data: ChzzkChatsSendRequest,
): Promise<ChzzkApiResponse<ChzzkChatsSendResponse>> {
  return http<ChzzkApiResponse<ChzzkChatsSendResponse>>(`${CHZZK_URI}/open/v1/chats/send`, 'POST', {
    headers: ACCESS_TOKEN_HEADERS(token),
    json: {
      message: data.message,
    },
  });
}

export function notice(
  token: string,
  data: ChzzkChatsNoticeRequest,
): Promise<ChzzkApiResponse<null>> {
  return http<ChzzkApiResponse<null>>(`${CHZZK_URI}/open/v1/chats/notice`, 'POST', {
    headers: ACCESS_TOKEN_HEADERS(token),
    json: {
      message: data.message,
      messageId: data.messageId,
    },
  });
}

export function setting(token: string): Promise<ChzzkApiResponse<ChzzkChatsSettingsResponse>> {
  return http<ChzzkApiResponse<ChzzkChatsSettingsResponse>>(
    `${CHZZK_URI}/open/v1/chats/settings`,
    'GET',
    {
      headers: ACCESS_TOKEN_HEADERS(token),
    },
  );
}

export function settingUpdate(
  token: string,
  data: ChzzkChatsSettingsPut,
): Promise<ChzzkApiResponse<ChzzkChatsSettingsResponse>> {
  return http<ChzzkApiResponse<ChzzkChatsSettingsResponse>>(
    `${CHZZK_URI}/open/v1/chats/settings`,
    'PUT',
    {
      headers: ACCESS_TOKEN_HEADERS(token),
      json: data,
    },
  );
}

import { http } from '../../lib/http';
import { ACCESS_TOKEN_HEADERS, CHZZK_URI, CLIENT_AUTH_HEADERS } from './chzzk.config';
import {
  ChzzkApiResponse,
  ChzzkLivesRequest,
  ChzzkLivesResponse,
  ChzzkLivesSettingPatch,
  ChzzkLivesSettingResponse,
  ChzzkStreamsKeyResponse,
} from './index.d';

export function lives(data: ChzzkLivesRequest): Promise<ChzzkApiResponse<ChzzkLivesResponse>> {
  return http<ChzzkApiResponse<ChzzkLivesResponse>>(`${CHZZK_URI}/open/v1/lives`, 'GET', {
    headers: CLIENT_AUTH_HEADERS,
    params: {
      size: data.size,
      next: data.next,
    },
  });
}

export function streamsKey(data: {
  token: string;
}): Promise<ChzzkApiResponse<ChzzkStreamsKeyResponse>> {
  return http<ChzzkApiResponse<ChzzkStreamsKeyResponse>>(
    `${CHZZK_URI}/open/v1/streams/key`,
    'GET',
    {
      headers: ACCESS_TOKEN_HEADERS(data.token),
    },
  );
}

export function livesSetting(data: {
  token: string;
}): Promise<ChzzkApiResponse<ChzzkLivesSettingResponse>> {
  return http<ChzzkApiResponse<ChzzkLivesSettingResponse>>(
    `${CHZZK_URI}/open/v1/lives/setting`,
    'GET',
    {
      headers: ACCESS_TOKEN_HEADERS(data.token),
    },
  );
}

export function livesSettingUpdate(
  data: { token: string } & ChzzkLivesSettingPatch,
): Promise<ChzzkApiResponse<null>> {
  return http<ChzzkApiResponse<null>>(`${CHZZK_URI}/open/v1/lives/setting`, 'PATCH', {
    headers: ACCESS_TOKEN_HEADERS(data.token),
    params: {
      defaultLiveTitle: data.defaultLiveTitle,
      categoryType: data.categoryType,
      categoryId: data.categoryId,
      tags: data.tags?.join(',') ?? undefined,
    },
  });
}

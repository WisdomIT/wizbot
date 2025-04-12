import { http } from '../../lib/http';
import { ACCESS_TOKEN_HEADERS, CHZZK_URI } from './chzzk.config';
import { ChzzkApiResponse, ChzzkUsersMeResponse } from './index.d';

export function me(token: string): Promise<ChzzkApiResponse<ChzzkUsersMeResponse>> {
  return http<ChzzkApiResponse<ChzzkUsersMeResponse>>(`${CHZZK_URI}/open/v1/users/me`, 'GET', {
    headers: ACCESS_TOKEN_HEADERS(token),
  });
}

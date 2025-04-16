import { http } from '../../lib/http';
import { CHZZK_ID, CHZZK_SECRET, CHZZK_URI } from './chzzk.config';
import {
  ChzzkAccessTokenRequest,
  ChzzkApiResponse,
  ChzzkRefreshTokenRequest,
  ChzzkTokenResponse,
  ChzzkTokenRevokeRequest,
} from './index.d';

export function accessToken(data: {
  code: ChzzkAccessTokenRequest['code'];
  state: ChzzkAccessTokenRequest['state'];
}): Promise<ChzzkApiResponse<ChzzkTokenResponse>> {
  return http<ChzzkApiResponse<ChzzkTokenResponse>>(`${CHZZK_URI}/auth/v1/token`, 'POST', {
    json: {
      grantType: 'authorization_code',
      clientId: CHZZK_ID,
      clientSecret: CHZZK_SECRET,
      code: data.code,
      state: data.state,
    },
  });
}

export function refreshToken(data: {
  refreshToken: ChzzkRefreshTokenRequest['refreshToken'];
}): Promise<ChzzkApiResponse<ChzzkTokenResponse>> {
  return http<ChzzkApiResponse<ChzzkTokenResponse>>(`${CHZZK_URI}/auth/v1/token`, 'POST', {
    json: {
      grantType: 'refresh_token',
      clientId: CHZZK_ID,
      clientSecret: CHZZK_SECRET,
      refreshToken: data.refreshToken,
    },
  });
}

export function revokeToken(data: {
  token: ChzzkTokenRevokeRequest['token'];
  tokenTypeHint: ChzzkTokenRevokeRequest['tokenTypeHint'];
}): Promise<ChzzkApiResponse<null>> {
  return http<ChzzkApiResponse<null>>(`${CHZZK_URI}/auth/v1/revoke`, 'POST', {
    json: {
      clientId: CHZZK_ID,
      clientSecret: CHZZK_SECRET,
      token: data.token,
      tokenTypeHint: data.tokenTypeHint,
    },
  });
}

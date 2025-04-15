import { http } from '../../lib/http';
import { ACCESS_TOKEN_HEADERS, CHZZK_URI, CLIENT_AUTH_HEADERS } from './chzzk.config';
import {
  ChzzkApiResponse,
  ChzzkSessionsAuthClientResponse,
  ChzzkSessionsAuthResponse,
  ChzzkSessionsClientRequest,
  ChzzkSessionsClientResponse,
  ChzzkSessionsEventsSubscribeChatRequest,
  ChzzkSessionsEventsSubscribeDonationRequest,
  ChzzkSessionsEventsUnsubscribeChatRequest,
  ChzzkSessionsEventsUnsubscribeDonationRequest,
  ChzzkSessionsRequest,
  ChzzkSessionsResponse,
} from './index.d';

export function authClient(): Promise<ChzzkApiResponse<ChzzkSessionsAuthClientResponse>> {
  return http<ChzzkApiResponse<ChzzkSessionsAuthClientResponse>>(
    `${CHZZK_URI}/open/v1/sessions/auth/client`,
    'GET',
    {
      headers: CLIENT_AUTH_HEADERS,
    },
  );
}

export function auth(token: string): Promise<ChzzkApiResponse<ChzzkSessionsAuthResponse>> {
  return http<ChzzkApiResponse<ChzzkSessionsAuthResponse>>(
    `${CHZZK_URI}/open/v1/sessions/auth`,
    'GET',
    {
      headers: ACCESS_TOKEN_HEADERS(token),
    },
  );
}

export function client(
  data: ChzzkSessionsClientRequest,
): Promise<ChzzkApiResponse<ChzzkSessionsClientResponse>> {
  return http<ChzzkApiResponse<ChzzkSessionsClientResponse>>(
    `${CHZZK_URI}/open/v1/sessions/client`,
    'GET',
    {
      headers: CLIENT_AUTH_HEADERS,
      params: {
        size: data.size,
        page: data.page,
      },
    },
  );
}

export function sessions(
  token: string,
  data: ChzzkSessionsRequest,
): Promise<ChzzkApiResponse<ChzzkSessionsResponse>> {
  return http<ChzzkApiResponse<ChzzkSessionsResponse>>(`${CHZZK_URI}/open/v1/sessions`, 'GET', {
    headers: ACCESS_TOKEN_HEADERS(token),
    params: {
      size: data.size,
      page: data.page,
    },
  });
}

export function eventsSubscribeChat(
  data: ChzzkSessionsEventsSubscribeChatRequest,
): Promise<ChzzkApiResponse<null>> {
  return http<ChzzkApiResponse<null>>(
    `${CHZZK_URI}/open/v1/sessions/events/subscribe/chat`,
    'POST',
    {
      headers: CLIENT_AUTH_HEADERS,
      json: {
        sessionKey: data.sessionKey,
      },
    },
  );
}

export function eventsUnsubscribeChat(
  data: ChzzkSessionsEventsUnsubscribeChatRequest,
): Promise<ChzzkApiResponse<null>> {
  return http<ChzzkApiResponse<null>>(
    `${CHZZK_URI}/open/v1/sessions/events/unsubscribe/chat`,
    'POST',
    {
      headers: CLIENT_AUTH_HEADERS,
      json: {
        sessionKey: data.sessionKey,
      },
    },
  );
}

export function eventsSubscribeDonation(
  data: ChzzkSessionsEventsSubscribeDonationRequest,
): Promise<ChzzkApiResponse<null>> {
  return http<ChzzkApiResponse<null>>(
    `${CHZZK_URI}/open/v1/sessions/events/subscribe/donation`,
    'POST',
    {
      headers: CLIENT_AUTH_HEADERS,
      json: {
        sessionKey: data.sessionKey,
      },
    },
  );
}

export function eventsUnsubscribeDonation(
  data: ChzzkSessionsEventsUnsubscribeDonationRequest,
): Promise<ChzzkApiResponse<null>> {
  return http<ChzzkApiResponse<null>>(
    `${CHZZK_URI}/open/v1/sessions/events/unsubscribe/donation`,
    'POST',
    {
      headers: CLIENT_AUTH_HEADERS,
      json: {
        sessionKey: data.sessionKey,
      },
    },
  );
}

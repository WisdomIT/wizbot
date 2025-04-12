import { http } from '../../lib/http';
import { CHZZK_URI, CLIENT_AUTH_HEADERS } from './chzzk.config';
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

export function auth(): Promise<ChzzkApiResponse<ChzzkSessionsAuthResponse>> {
  return http<ChzzkApiResponse<ChzzkSessionsAuthResponse>>(
    `${CHZZK_URI}/open/v1/sessions/auth`,
    'GET',
    {
      headers: CLIENT_AUTH_HEADERS,
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
  data: ChzzkSessionsRequest,
): Promise<ChzzkApiResponse<ChzzkSessionsResponse>> {
  return http<ChzzkApiResponse<ChzzkSessionsResponse>>(`${CHZZK_URI}/open/v1/sessions`, 'GET', {
    headers: CLIENT_AUTH_HEADERS,
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

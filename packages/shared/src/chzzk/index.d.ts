export interface ChzzkApiResponseSuccess<T> {
  code: 200;
  message: null;
  content: T;
}

export interface ChzzkApiResponseFailed {
  code: 400 | 401 | 403 | 404 | 429 | 500;
  message: string;
}

export type ChzzkApiResponse<T> = ChzzkApiResponseSuccess<T> | ChzzkApiResponseFailed;

export interface ChzzkAccessTokenRequest {
  grantType: 'authorization_code';
  clientId: string;
  clientSecret: string;
  code: string;
  state: string;
}

export interface ChzzkRefreshTokenRequest {
  grantType: 'refresh_token';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type ChzzkTokenRequest = ChzzkAccessTokenRequest | ChzzkRefreshTokenRequest;

export interface ChzzkTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  scope: string;
}

export interface ChzzkTokenRevokeRequest {
  clientId: string;
  clientSecret: string;
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
}

type SessionsEventType = 'CHAT' | 'DONATION';

export interface ChzzkSessionsAuthClientRequest {}

export interface ChzzkSessionsAuthClientResponse {
  url: string;
}

export interface ChzzkSessionsAuthRequest {}

export interface ChzzkSessionsAuthResponse {
  url: string;
}

export interface ChzzkSessionsClientRequest {
  size?: number;
  page?: string;
}

export interface ChzzkSessionsClientResponse {
  data: {
    sessionKey: string;
    connectedDate: string;
    disconnedtedDate: string;
    subscribedEvents: {
      eventType: SessionsEventType;
      channelId: string;
    }[];
  }[];
}

export interface ChzzkSessionsRequest {
  size?: number;
  page?: string;
}

export interface ChzzkSessionsResponse {
  data: {
    sessionKey: string;
    connectedDate: string;
    disconnedtedDate: string;
    subscribedEvents: {
      eventType: SessionsEventType;
      channelId: string;
    }[];
  }[];
}

export interface ChzzkSessionsEventsSubscribeChatRequest {
  sessionKey: string;
}

export interface ChzzkSessionsEventsUnsubscribeChatRequest {
  sessionKey: string;
}

export interface ChzzkSessionsEventsSubscribeDonationRequest {
  sessionKey: string;
}

export interface ChzzkSessionsEventsUnsubscribeDonationRequest {
  sessionKey: string;
}

export interface ChzzkSessionsMessageSystemConnected {
  type: 'connected';
  data: {
    sessionKey: string;
  };
}

export interface ChzzkSessionsMessageSystemSubscribed {
  type: 'subscribed';
  data: {
    eventType: SessionsEventType;
    channelId: string;
  };
}

export interface ChzzkSessionsMessageSystemUnsubscribed {
  type: 'unsubscribed';
  data: {
    eventType: SessionsEventType;
    channelId: string;
  };
}

export interface ChzzkSessionsMessageSystemRevoked {
  type: 'revoked';
  data: {
    eventType: SessionsEventType;
    channelId: string;
  };
}

export type ChzzkSessionsMessageSystem =
  | ChzzkSessionsMessageSystemConnected
  | ChzzkSessionsMessageSystemSubscribed
  | ChzzkSessionsMessageSystemUnsubscribed
  | ChzzkSessionsMessageSystemRevoked;

export interface ChzzkSessionsMessageChat {
  channelId: string;
  senderChannelId: string;
  profile: {
    nickname: string;
    badges: {
      imageUrl: string;
    }[];
    verifiedMark: boolean;
  };
  content: string;
  emojis: {
    [key: string]: string;
  }[];
  messageTime: number;
}

export interface ChzzkSessionsMessageDonation {
  donationType: 'CHAT' | 'VIDEO';
  channelId: string;
  donatorChannelId: string;
  donatorNickname: string;
  payAmount: string;
  donationText: string;
  emojis: {
    key: string;
    value: string;
  }[];
}

export interface ChzzkUsersMeRequest {}

export interface ChzzkUsersMeResponse {
  channelId: string;
  channelName: string;
}

export interface ChzzkChannelsRequest {
  channelIds: string[];
}

export interface ChzzkChannelsResponse {
  data: {
    channelId: string;
    channelName: string;
    channelImageUrl: string;
    followerCount: number;
  }[];
}

export interface ChzzkCategoriesSearchRequest {
  size?: number;
  query: string;
}

type CategoryType = 'GAME' | 'SPORTS' | 'ETC';

export interface ChzzkCategoriesSearchResponse {
  data: {
    categoryType: CategoryType;
    categoryId: string;
    categoryValue: string;
    posterImageUrl: string;
  }[];
}

export interface ChzzkLivesRequest {
  size?: number;
  next?: string;
}

export interface ChzzkLivesResponse {
  data: {
    liveId: number;
    liveTitle: string;
    liveThumbnailImageUrl: string;
    concurrentUserCount: number;
    openDate: string;
    adult: boolean;
    tags: string[];
    categoryType: CategoryType;
    liveCategory: string;
    liveCategoryValue: string;
    channelId: string;
    channelName: string;
    channelImageUrl: string;
  }[];
  page: {
    next: string;
  };
}

export interface ChzzkStreamsKeyRequest {}

export interface ChzzkStreamsKeyResponse {
  streamKey: string;
}

export interface ChzzkLivesSettingRequest {}

export interface ChzzkLivesSettingResponse {
  defaultLiveTitle: string;
  category: {
    categoryType: CategoryType;
    categoryId: string;
    categoryValue: string;
    posterImageUrl: string;
  };
  tags: string[];
}

export interface ChzzkLivesSettingPatch {
  defaultLiveTitle?: string;
  categoryType?: CategoryType;
  categoryId?: string;
  tags?: string[];
}

export interface ChzzkChatsSendRequest {
  message: string;
}

export interface ChzzkChatsSendResponse {
  messageId: string;
}

export interface ChzzkChatsNoticeRequest {
  message?: string;
  messageId?: string;
}

export interface ChzzkChatsSettingsRequest {}

export interface ChzzkChatsSettingsResponse {
  chatAvailableCondition: 'NONE' | 'REAL_NAME';
  chatAvailableGroup: 'ALL' | 'FOLLOWER' | 'MANAGER' | 'SUBSCRIBER';
  minFollowerMinute: 0 | 5 | 10 | 30 | 60 | 1440 | 10080 | 43200;
  allowSubscriberFollowerMode: boolean;
}

export interface ChzzkChatsSettingsPut {
  chatAvailableCondition?: 'NONE' | 'REAL_NAME';
  chatAvailableGroup?: 'ALL' | 'FOLLOWER' | 'MANAGER' | 'SUBSCRIBER';
  minFollowerMinute?: 0 | 5 | 10 | 30 | 60 | 1440 | 10080 | 43200;
  allowSubscriberFollowerMode?: boolean;
}

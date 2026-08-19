import type { ChzzkTokenSet, TokenStore } from 'chzzk-open-sdk';

import { trpc } from './trpc';

/**
 * 읽기 전용 TokenStore — 토큰 조회는 API(user.ensureAccessToken)에 위임한다 (#30 토큰 소유 원칙).
 *
 * - API 가 만료 임박 갱신을 이미 보장하므로(60초 skew) 여기서 받은 토큰은 항상 신선하다.
 *   워커측 클라이언트는 expirySkewSeconds: 0 으로 두어 SDK 가 자체 갱신을 시도하지 않게 한다.
 * - refreshToken 은 워커에 절대 내려오지 않는다. 만에 하나 SDK 가 갱신을 시도하면
 *   빈 refresh token 으로 즉시 실패한다 (조용히 경합을 일으키는 것보다 낫다).
 * - set/clear 는 no-op — 토큰 영속화는 API 의 PrismaTokenStore 만 수행한다.
 */
export class ApiTokenStore implements TokenStore {
  constructor(private readonly userId: number) {}

  async get(): Promise<ChzzkTokenSet | null> {
    const { accessToken, expiresIn } = await trpc.user.ensureAccessToken.mutate({
      userId: this.userId,
    });

    return {
      accessToken,
      refreshToken: '',
      tokenType: 'Bearer',
      expiresIn,
      obtainedAt: Date.now(),
    };
  }

  async set(): Promise<void> {
    // no-op: 워커는 토큰을 영속화하지 않는다
  }

  async clear(): Promise<void> {
    // no-op
  }
}

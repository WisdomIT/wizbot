import type { PrismaClient } from '@prisma/client';
import { ChzzkOpenClient, ChzzkTokenSet, TokenStore } from 'chzzk-open-sdk';

/**
 * 치지직 SDK 클라이언트 팩토리 (#30 PR1).
 *
 * 토큰 소유 원칙: 유저 토큰의 조회·갱신은 **API 프로세스만** 수행한다.
 * - 웹 로그인 인터락도 tRPC mutation(=API 프로세스)에서 실행된다.
 * - 챗봇 워커는 user.ensureAccessToken(internal)으로 API에 위임한다.
 * - refresh token이 일회용이므로 SDK의 single-flight는 프로세스 내 경합만 막는다.
 *   ⚠ 따라서 API replica 를 2개 이상으로 늘리려면 프로세스 간 갱신 조율(행 잠금 등)이 먼저 필요하다.
 */

function getCredentials() {
  return {
    clientId: process.env.CHZZK_ID ?? '',
    clientSecret: process.env.CHZZK_SECRET ?? '',
  };
}

/**
 * OAuthCredential 테이블을 SDK TokenStore 로 노출한다.
 *
 * DB 는 만료 "시각"(expiresIn: DateTime)을 저장하고 SDK 는 {expiresIn(초), obtainedAt(ms)} 를 쓴다.
 * get() 은 남은 시간 기준으로 변환한다 — 남은 시간이 expirySkewSeconds(기본 60초) 미만이면
 * SDK 가 만료 임박으로 판단해 선제 갱신한다.
 */
export class PrismaTokenStore implements TokenStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly userId: number,
  ) {}

  async get(): Promise<ChzzkTokenSet | null> {
    const credential = await this.prisma.oAuthCredential.findUnique({
      where: { userId: this.userId },
    });
    if (!credential) return null;

    const now = Date.now();
    return {
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      tokenType: credential.tokenType,
      expiresIn: Math.floor((credential.expiresIn.getTime() - now) / 1000),
      obtainedAt: now,
    };
  }

  async set(tokens: ChzzkTokenSet): Promise<void> {
    const expiresAt = new Date(tokens.obtainedAt + tokens.expiresIn * 1000);
    await this.prisma.oAuthCredential.upsert({
      where: { userId: this.userId },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresIn: expiresAt,
      },
      create: {
        userId: this.userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresIn: expiresAt,
      },
    });
  }

  async clear(): Promise<void> {
    await this.prisma.oAuthCredential.deleteMany({ where: { userId: this.userId } });
  }
}

/** userId별 클라이언트 캐시 — SDK의 single-flight 갱신이 유저 단위로 동작하게 한다 */
const userClients = new Map<number, ChzzkOpenClient>();

/** 특정 스트리머의 유저 토큰으로 동작하는 클라이언트 (조회 시점에 토큰을 읽지 않음 — lazy) */
export function getChzzkClientForUser(prisma: PrismaClient, userId: number): ChzzkOpenClient {
  const cached = userClients.get(userId);
  if (cached) return cached;

  const client = new ChzzkOpenClient({
    ...getCredentials(),
    tokenStore: new PrismaTokenStore(prisma, userId),
  });
  userClients.set(userId, client);
  return client;
}

let appClient: ChzzkOpenClient | null = null;

/** 클라이언트 자격증명 전용 (카테고리 검색, 채널 조회 등 유저 토큰이 필요 없는 API) */
export function getChzzkAppClient(): ChzzkOpenClient {
  if (!appClient) appClient = new ChzzkOpenClient(getCredentials());
  return appClient;
}

/** 임의 TokenStore 를 붙인 클라이언트 — 신청 대기자 토큰 갱신처럼 userId 가 없는 경우 (#151) */
export function createChzzkClientWithStore(tokenStore: TokenStore): ChzzkOpenClient {
  return new ChzzkOpenClient({ ...getCredentials(), tokenStore });
}

/** 로그인 인터락용 일회성 클라이언트 — userId 를 알기 전이므로 메모리 스토어를 쓴다 */
export function createChzzkLoginClient(): ChzzkOpenClient {
  return new ChzzkOpenClient(getCredentials());
}

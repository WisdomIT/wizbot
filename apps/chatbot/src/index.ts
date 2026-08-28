/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'node:http';

import { ChannelInfo, ChannelSession } from './channelSession';
import { trpc } from './trpc';

for (const key of ['INTERNAL_API_TOKEN', 'CHZZK_ID', 'CHZZK_SECRET'] as const) {
  if (!process.env[key]) {
    console.error(`❌ ${key} 환경변수가 없습니다. apps/chatbot/.env 를 확인하세요.`);
    process.exit(1);
  }
}

// 마지막 방어선 — 개별 핸들러가 놓친 예외로 프로세스가 죽지 않게 한다 (#27)
process.on('unhandledRejection', (reason) => {
  console.error('❌ [unhandledRejection]', reason);
});
process.on('uncaughtException', (error) => {
  console.error('❌ [uncaughtException]', error);
});

console.log('🚀 Chatbot 워커가 실행되었습니다!');

const POLL_INTERVAL_MS = 60 * 1000;

/** userId → 세션. 채널별 연결/타이머의 단일 소유자 (#29) */
const sessions = new Map<number, ChannelSession>();
/** 신청 승인 후 아직 로그인하지 않은 채널 — 1시간마다 채팅으로 안내 (#151) */
const NOTICE_INTERVAL_MS = 60 * 60 * 1000;
const pendingNotice = new Set<number>();
const lastNoticeAt = new Map<number, number>();
let botChannelId: string | null = null;
let lastPollAt: Date | null = null;

/** DB 채널 목록과 세션을 diff 동기화한다 — 추가는 연결, 삭제는 정리 */
async function syncChannels(): Promise<void> {
  botChannelId ??= (await trpc.chatbot.getChatbotChannelId.query()) ?? null;
  if (!botChannelId) {
    console.error('❌ CHZZK_BOT_CHANNEL_ID 가 API 에 설정되지 않았습니다. 연결을 건너뜁니다.');
    return;
  }

  const rows = await trpc.chatbot.getChannels.query();
  const channels: ChannelInfo[] = rows.map((row) => ({
    userId: row.id,
    channelId: row.channelId,
    channelName: row.channelName,
  }));
  pendingNotice.clear();
  for (const row of rows) if (row.pendingNotice) pendingNotice.add(row.id);
  const wanted = new Set(channels.map((channel) => channel.userId));

  // DB 에서 사라진 채널 정리
  for (const [userId, session] of sessions) {
    if (!wanted.has(userId)) {
      session.dispose();
      sessions.delete(userId);
    }
  }

  // 새 채널 연결 (실패해도 다른 채널에 영향 없음 — 다음 폴링에서 재시도)
  for (const channel of channels) {
    if (sessions.has(channel.userId)) continue;

    const session = new ChannelSession(channel, botChannelId);
    sessions.set(channel.userId, session);
    try {
      await session.start();
    } catch (error) {
      console.error('❌ 채널 연결 실패:', channel.channelName, error);
      session.dispose();
      sessions.delete(channel.userId);
    }
  }
}

/** 반복 메시지 동기화 — 연결된 채널만 */
async function syncRepeats(): Promise<void> {
  for (const session of sessions.values()) {
    try {
      await session.syncRepeats();
    } catch (error) {
      console.error('❌ 반복 동기화 실패:', session.info.channelName, error);
    }
  }
}

/**
 * 승인 안내 — 연결된 채널 중 승인 후 아직 로그인하지 않은 곳에 1시간마다 (#151).
 * 방송 중이 아닐 때 남긴 채팅은 세션이 갱신되며 사라지므로 한 번으로는 부족하다.
 * 스트리머가 로그인하면 API 가 acknowledgedAt 을 찍고 다음 폴링에서 대상에서 빠진다.
 */
async function syncApprovalNotices(): Promise<void> {
  for (const [userId, session] of sessions) {
    if (!pendingNotice.has(userId)) {
      lastNoticeAt.delete(userId);
      continue;
    }
    const last = lastNoticeAt.get(userId) ?? 0;
    if (Date.now() - last < NOTICE_INTERVAL_MS) continue;
    try {
      const result = await trpc.chatbot.sendApprovalNotice.mutate({ userId });
      if (result.ok) {
        lastNoticeAt.set(userId, Date.now());
        console.log('📣 승인 안내:', session.info.channelName);
      } else {
        console.error('❌ 승인 안내 실패:', session.info.channelName, result.message);
      }
    } catch (error) {
      console.error('❌ 승인 안내 오류:', session.info.channelName, error);
    }
  }
}

/** 신청 대기자 토큰 갱신 — 실제 갱신 여부는 API 가 만료 임박 기준으로 정한다 (#151) */
async function refreshPendingTokens(): Promise<void> {
  try {
    const { refreshed, cleared } = await trpc.signup.refreshPendingTokens.mutate();
    if (refreshed || cleared) console.log(`🔑 대기자 토큰: 갱신 ${refreshed}, 정리 ${cleared}`);
  } catch (error) {
    console.error('❌ 대기자 토큰 갱신 실패:', error);
  }
}

// 재진입 가드 — 채널 연결(connectedTimeoutMs 최대 10s×채널 수)로 한 번의 폴링이 주기(60s)를
// 넘길 수 있다. 겹쳐 실행되면 같은 반복 id 의 타이머가 이중 생성·누수된다 (PR #61 리뷰).
let polling = false;

async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    await syncChannels();
    await syncRepeats();
    await syncApprovalNotices();
    await refreshPendingTokens();
    lastPollAt = new Date();
  } catch (error) {
    console.error('❌ 폴링 실패:', error);
  } finally {
    polling = false;
  }
}

void poll();
setInterval(() => void poll(), POLL_INTERVAL_MS);

// 헬스체크 — 컨테이너 healthcheck 용. 마지막 폴링이 3주기 이상 밀리면 unhealthy
const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 3003);
createServer((req, res) => {
  const stale = !lastPollAt || Date.now() - lastPollAt.getTime() > POLL_INTERVAL_MS * 3;
  res.writeHead(stale ? 503 : 200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      ok: !stale,
      channels: sessions.size,
      lastPollAt: lastPollAt?.toISOString() ?? null,
    }),
  );
}).listen(HEALTH_PORT, () => console.log(`🩺 헬스체크: http://localhost:${HEALTH_PORT}/`));

// 정상 종료 — 소켓/타이머 정리
function shutdown() {
  console.log('👋 종료 중...');
  for (const session of sessions.values()) session.dispose();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

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

async function poll(): Promise<void> {
  try {
    await syncChannels();
    await syncRepeats();
    lastPollAt = new Date();
  } catch (error) {
    console.error('❌ 폴링 실패:', error);
  }
}

void poll();
setInterval(() => void poll(), POLL_INTERVAL_MS);

// 헬스체크 — 컨테이너 healthcheck 용. 마지막 폴링이 3주기 이상 밀리면 unhealthy
import { createServer } from 'node:http';

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

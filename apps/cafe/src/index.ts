/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'node:http';

import { checkSession, closeBrowser, type NaverCookies, requestJoin, verifyGateAccess } from './naver';
import { trpc } from './trpc';

for (const key of ['INTERNAL_API_TOKEN'] as const) {
  if (!process.env[key]) {
    console.error(`❌ ${key} 환경변수가 없습니다.`);
    process.exit(1);
  }
}
process.on('unhandledRejection', (reason) => console.error('❌ [unhandledRejection]', reason));
process.on('uncaughtException', (error) => console.error('❌ [uncaughtException]', error));

console.log('🚀 카페 워커가 실행되었습니다!');

const POLL_INTERVAL_MS = 60 * 1000;
/** 세션 유효성 검사 주기 — 만료를 늦어도 30분 안에 안다 */
const SESSION_CHECK_MS = 30 * 60 * 1000;
let lastSessionCheckAt = 0;
let lastPollAt: Date | null = null;

async function getCookies(): Promise<NaverCookies | null> {
  const session = await trpc.cafe.botSession.query();
  return session ? { nidAut: session.nidAut, nidSes: session.nidSes } : null;
}

/** 스트리머가 콘솔에서 시킨 일 — 가입 신청·권한 확인 (#9 PR1) */
async function processActions(cookies: NaverCookies): Promise<void> {
  const actions = await trpc.cafe.pendingActions.query();
  for (const action of actions) {
    const label = `[${action.user.channelName} → ${action.cafeName ?? action.clubId}]`;
    try {
      const result =
        action.pendingAction === 'JOIN'
          ? await requestJoin(cookies, action.clubId!)
          : await verifyGateAccess(cookies, action.clubId!);

      if (result.ok) {
        const status = action.pendingAction === 'JOIN' ? 'JOIN_REQUESTED' : 'PERMISSION_OK';
        await trpc.cafe.completeAction.mutate({ id: action.id, status, message: null });
        console.log('✅', label, action.pendingAction, '→', status);
      } else {
        const status = action.pendingAction === 'JOIN' ? 'JOIN_FAILED' : 'PERMISSION_FAILED';
        await trpc.cafe.completeAction.mutate({ id: action.id, status, message: result.message });
        console.warn('⚠️', label, action.pendingAction, '→', status, result.message);
        // 세션 만료는 전체에 영향 — 즉시 보고하고 나머지는 다음 폴링에
        if (result.reason === 'SESSION_INVALID') {
          await trpc.cafe.reportSessionCheck.mutate({ valid: false, message: result.message });
          lastSessionCheckAt = Date.now();
          return;
        }
      }
    } catch (error) {
      console.error('❌', label, action.pendingAction, '처리 오류:', error);
      await trpc.cafe
        .completeAction.mutate({
          id: action.id,
          status: action.pendingAction === 'JOIN' ? 'JOIN_FAILED' : 'PERMISSION_FAILED',
          message: `처리 중 오류: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
        })
        .catch(() => null);
    }
  }
}

async function syncSession(cookies: NaverCookies): Promise<void> {
  if (Date.now() - lastSessionCheckAt < SESSION_CHECK_MS) return;
  lastSessionCheckAt = Date.now();
  const result = await checkSession(cookies);
  await trpc.cafe.reportSessionCheck.mutate({ valid: result.ok, message: result.ok ? null : result.message });
  console.log(result.ok ? '🔐 네이버 세션 유효' : `🔒 네이버 세션 무효: ${result.message}`);
}

let polling = false;
async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const cookies = await getCookies();
    if (!cookies) {
      console.warn('⏸ 봇 계정 세션이 등록되지 않았습니다 — 어드민 > 네이버 봇 계정');
      return;
    }
    await syncSession(cookies);
    await processActions(cookies);
    lastPollAt = new Date();
  } catch (error) {
    console.error('❌ 폴링 실패:', error);
  } finally {
    polling = false;
  }
}

void poll();
setInterval(() => void poll(), POLL_INTERVAL_MS);

const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? 3004);
createServer((req, res) => {
  const stale = !lastPollAt || Date.now() - lastPollAt.getTime() > POLL_INTERVAL_MS * 3;
  res.writeHead(stale ? 503 : 200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: !stale, lastPollAt: lastPollAt?.toISOString() ?? null }));
}).listen(HEALTH_PORT, () => console.log(`🩺 헬스체크: http://localhost:${HEALTH_PORT}/`));

function shutdown() {
  console.log('👋 종료 중...');
  void closeBrowser().finally(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

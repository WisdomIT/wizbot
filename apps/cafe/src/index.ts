/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'node:http';

import { findImageTags, normalizeGateHtml } from '@wizbot/shared/lib/cafeGate';

import { checkSession, closeBrowser, type NaverCookies, readGate, verifyGateAccess, writeGate } from './naver';
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

/** 폴링은 가볍다(internal 조회 1회) — 스트리머 요청과 어드민의 세션 갱신에 빨리 반응하도록 짧게 */
const POLL_INTERVAL_MS = 15 * 1000;
/** 세션 유효성 검사 주기 — 만료를 늦어도 30분 안에 안다 */
const SESSION_CHECK_MS = 30 * 60 * 1000;
let lastSessionCheckAt = 0;
let lastPollAt: Date | null = null;

type BotSession = NaverCookies & { updatedAt: string | Date; checkedAt: string | Date | null };

async function getSession(): Promise<BotSession | null> {
  const session = await trpc.cafe.botSession.query();
  return session ? { nidAut: session.nidAut, nidSes: session.nidSes, updatedAt: session.updatedAt, checkedAt: session.checkedAt } : null;
}

type PendingAction = Awaited<ReturnType<typeof trpc.cafe.pendingActions.query>>[number];
type ActionOutcome = { ok: true; log: string } | { ok: false; message: string; sessionInvalid?: boolean };

/** 권한 확인 (#9 PR1) */
async function runVerify(cookies: NaverCookies, action: PendingAction): Promise<ActionOutcome> {
  const result = await verifyGateAccess(cookies, action.clubId!);
  if (result.ok) {
    await trpc.cafe.completeAction.mutate({ id: action.id, status: 'PERMISSION_OK', message: null });
    return { ok: true, log: '권한 확인' };
  }
  await trpc.cafe.completeAction.mutate({ id: action.id, status: 'PERMISSION_FAILED', message: result.message });
  return { ok: false, message: result.message, sessionInvalid: result.reason === 'SESSION_INVALID' };
}

/** 대문 HTML 읽어오기 (#9 PR3) — 스트리머가 삽입 자리를 고를 수 있게 */
async function runFetchGate(cookies: NaverCookies, action: PendingAction): Promise<ActionOutcome> {
  const result = await readGate(cookies, action.clubId!);
  if (!result.ok) {
    await trpc.cafe.completeGateSave.mutate({ id: action.id, ok: false, message: result.message });
    return { ok: false, message: result.message, sessionInvalid: result.reason === 'SESSION_INVALID' };
  }
  await trpc.cafe.completeGateFetch.mutate({ id: action.id, html: result.html });
  return { ok: true, log: `대문 읽음 (${result.html.length}자)` };
}

/**
 * 대문 저장 (#9 PR3). 스트리머가 고른 자리는 읽어온 HTML 기준이므로, 그사이 대문이 바뀌었으면
 * 덮어쓰지 않고 다시 가져오게 한다. 저장 후 다시 읽어 우리 이미지가 남아 있는지 확인해야 ACTIVE.
 */
async function runSaveGate(cookies: NaverCookies, action: PendingAction): Promise<ActionOutcome> {
  const fail = async (message: string, sessionInvalid = false): Promise<ActionOutcome> => {
    await trpc.cafe.completeGateSave.mutate({ id: action.id, ok: false, message });
    return { ok: false, message, sessionInvalid };
  };
  if (!action.gateDraft || action.gateHtml === null) return fail('저장할 HTML 이 없습니다. 대문을 다시 가져와주세요.');
  const current = await readGate(cookies, action.clubId!);
  if (!current.ok) return fail(current.message, current.reason === 'SESSION_INVALID');
  if (normalizeGateHtml(current.html) !== normalizeGateHtml(action.gateHtml)) {
    return fail('그사이 대문이 바뀌었습니다. 대문 HTML 을 다시 가져와 자리를 골라주세요.');
  }
  const saved = await writeGate(cookies, action.clubId!, action.gateDraft);
  if (!saved.ok) return fail(saved.message, saved.reason === 'SESSION_INVALID');
  if (findImageTags(saved.html).length === 0) {
    return fail('저장은 됐지만 대문에서 위즈봇 이미지를 찾지 못했습니다. 네이버 편집기가 태그를 지웠을 수 있습니다 — 관리자에게 알려주세요.');
  }
  await trpc.cafe.completeGateSave.mutate({ id: action.id, ok: true, html: saved.html });
  return { ok: true, log: '대문 저장 · 동작 시작' };
}

/** 스트리머가 콘솔에서 시킨 일 — 권한 확인·대문 읽기·대문 저장 (#9). 가입은 운영자가 직접 한다(보안문자) */
async function processActions(cookies: NaverCookies): Promise<void> {
  const actions = await trpc.cafe.pendingActions.query();
  for (const action of actions) {
    const label = `[${action.user.channelName} → ${action.cafeName ?? action.clubId}] ${action.pendingAction}`;
    try {
      const outcome = action.pendingAction === 'VERIFY'
        ? await runVerify(cookies, action)
        : action.pendingAction === 'FETCH_GATE'
          ? await runFetchGate(cookies, action)
          : await runSaveGate(cookies, action);
      if (outcome.ok) {
        console.log('✅', label, outcome.log);
        continue;
      }
      console.warn('⚠️', label, outcome.message);
      // 세션 만료는 전체에 영향 — 즉시 보고하고 나머지는 다음 폴링에
      if (outcome.sessionInvalid) {
        await trpc.cafe.reportSessionCheck.mutate({ valid: false, message: outcome.message });
        lastSessionCheckAt = Date.now();
        return;
      }
    } catch (error) {
      console.error('❌', label, '처리 오류:', error);
      const message = `처리 중 오류: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500);
      await (action.pendingAction === 'VERIFY'
        ? trpc.cafe.completeAction.mutate({ id: action.id, status: 'PERMISSION_FAILED', message })
        : trpc.cafe.completeGateSave.mutate({ id: action.id, ok: false, message })
      ).catch(() => null);
    }
  }
}

async function syncSession(session: BotSession): Promise<void> {
  // 어드민이 방금 저장한 세션(checkedAt 이 없거나 updatedAt 보다 이전)은 주기와 무관하게 바로 검사한다
  const fresh = !session.checkedAt || new Date(session.checkedAt) < new Date(session.updatedAt);
  if (!fresh && Date.now() - lastSessionCheckAt < SESSION_CHECK_MS) return;
  lastSessionCheckAt = Date.now();
  const result = await checkSession(session);
  await trpc.cafe.reportSessionCheck.mutate({ valid: result.ok, message: result.ok ? null : result.message });
  console.log(result.ok ? '🔐 네이버 세션 유효' : `🔒 네이버 세션 무효: ${result.message}`);
}

let polling = false;
async function poll(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const session = await getSession();
    if (!session) {
      console.warn('⏸ 봇 계정 세션이 등록되지 않았습니다 — 어드민 > 네이버 봇 계정');
      return;
    }
    await syncSession(session);
    await processActions(session);
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

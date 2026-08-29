/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'node:http';

import { buildImageTag, findImageTags, findYoutubeTags, imageSizeOf, imageSrcOf, normalizeGateHtml, replaceImageTags } from '@wizbot/shared/lib/cafeGate';
import { fetchLiveSnapshot } from '@wizbot/shared/lib/chzzkLive';

import { applyGatePlan, checkSession, closeBrowser, type NaverCookies, readGate, renderGate, verifyGateAccess, writeGate } from './naver';
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
/** 방송 상태 조회 주기 (이슈 §3: 30초~1분). 저장은 정책이 정한다 */
const LIVE_INTERVAL_MS = 30 * 1000;
let lastLiveAt = 0;
/** 세션 유효성 검사 주기 — 만료를 늦어도 30분 안에 안다 */
const SESSION_CHECK_MS = 30 * 60 * 1000;
let lastSessionCheckAt = 0;
let lastPollAt: Date | null = null;

type BotSession = NaverCookies & { updatedAt: string | Date; checkedAt: string | Date | null; valid: boolean | null };

async function getSession(): Promise<BotSession | null> {
  const session = await trpc.cafe.botSession.query();
  return session ? { nidAut: session.nidAut, nidSes: session.nidSes, updatedAt: session.updatedAt, checkedAt: session.checkedAt, valid: session.valid } : null;
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
  //  렌더 실패는 치명적이지 않다 — 그림 없이도(빈 대문처럼) 맨 아래 추가는 가능하다
  const render = await renderGate(result.html).catch((error) => {
    console.warn('⚠️ 대문 렌더 실패:', error instanceof Error ? error.message : error);
    return null;
  });
  await trpc.cafe.completeGateFetch.mutate({ id: action.id, html: result.html, render });
  return { ok: true, log: `대문 읽음 (${result.html.length}자${render ? `, 렌더 ${render.width}×${render.height}, 요소 ${render.boxes.length}` : ''})` };
}

/**
 * 대문 반영 (#9). API 가 세운 계획(어느 자리를 무슨 블록으로, 무엇을 뺄지)을 DOM 에서 실행해 저장한다.
 * 고른 자리는 읽어온 HTML 기준이므로 그사이 대문이 바뀌었으면 덮어쓰지 않고(stale) 다시 고르게 한다.
 * 저장 후 다시 읽어 블록이 남아 있어야 성공 — 네이버 편집기가 태그를 지울 수 있다.
 */
async function runSaveGate(cookies: NaverCookies, action: PendingAction): Promise<ActionOutcome> {
  const fail = async (message: string, opts: { sessionInvalid?: boolean; stale?: boolean } = {}): Promise<ActionOutcome> => {
    await trpc.cafe.completeGateSave.mutate({ id: action.id, ok: false, message, stale: opts.stale });
    return { ok: false, message, sessionInvalid: opts.sessionInvalid };
  };
  if (!action.plan || action.gateHtml === null) return fail('반영할 내용이 없습니다. 대문을 다시 가져와주세요.');
  const current = await readGate(cookies, action.clubId!);
  if (!current.ok) return fail(current.message, { sessionInvalid: current.reason === 'SESSION_INVALID' });
  if (normalizeGateHtml(current.html) !== normalizeGateHtml(action.gateHtml)) {
    return fail('그사이 대문이 바뀌었습니다. 대문 HTML 을 다시 가져와 자리를 골라주세요.', { stale: true });
  }
  const applied = await applyGatePlan(current.html, action.plan, action.picks);
  if (!applied.ok) return fail(applied.message, { stale: true });
  if (!applied.changed) {
    //  아직 설정이 안 끝난 자리뿐 — 경로만 갱신해 두고 끝
    await trpc.cafe.completeGateSave.mutate({ id: action.id, ok: true, html: current.html, picks: applied.picks, render: null });
    return { ok: true, log: '반영할 블록 없음 (설정 대기)' };
  }
  const saved = await writeGate(cookies, action.clubId!, applied.html);
  if (!saved.ok) return fail(saved.message, { sessionInvalid: saved.reason === 'SESSION_INVALID' });
  if (action.plan.image?.kind === 'replace' && findImageTags(saved.html).length === 0) {
    return fail('저장은 됐지만 대문에서 방송 상태 이미지를 찾지 못했습니다. 네이버 편집기가 태그를 지웠을 수 있습니다 — 관리자에게 알려주세요.');
  }
  if (action.plan.youtube?.kind === 'replace' && findYoutubeTags(saved.html).length === 0) {
    return fail('저장은 됐지만 대문에서 유튜브 영상을 찾지 못했습니다. 네이버 편집기가 iframe 을 지웠을 수 있습니다 — 관리자에게 알려주세요.');
  }
  const render = await renderGate(saved.html).catch(() => null);
  await trpc.cafe.completeGateSave.mutate({ id: action.id, ok: true, html: saved.html, picks: applied.picks, render });
  const done = [action.plan.image && `이미지 ${action.plan.image.kind}`, action.plan.youtube && `유튜브 ${action.plan.youtube.kind}`].filter(Boolean).join(', ');
  return { ok: true, log: `대문 반영 (${done})` };
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

/**
 * 방송 상태 폴링 → 대문 갱신 (#9 PR3b). 판정은 API(evaluateLive)가 DB 로 한다.
 * 저장 = 대문의 표식 <img> 를 새 일련번호 태그로 통째로 교체(스타일 누적 방지, 크기는 기존 태그 = 지정한 요소 크기) → 저장 → 재읽기에서 새 주소 확인.
 * 표식이 사라졌으면 동작을 멈추고 자리를 다시 고르게 한다.
 */
async function syncLive(cookies: NaverCookies): Promise<'session-invalid' | void> {
  if (Date.now() - lastLiveAt < LIVE_INTERVAL_MS) return;
  lastLiveAt = Date.now();
  const rows = await trpc.cafe.activeIntegrations.query();
  for (const row of rows) {
    const label = `[${row.channelName} → ${row.cafeName ?? row.clubId}]`;
    const snapshot = await fetchLiveSnapshot(row.channelId);
    if (!snapshot) {
      console.warn('⚠️', label, '치지직 방송 상태 조회 실패');
      continue;
    }
    const { save } = await trpc.cafe.evaluateLive.mutate({ id: row.id, snapshot });
    if (!save) continue;
    const fail = (message: string, extra: { missing?: boolean; html?: string } = {}) =>
      trpc.cafe.reportSave.mutate({ id: row.id, ok: false, message, ...extra }).catch(() => null);
    try {
      const current = await readGate(cookies, row.clubId);
      if (!current.ok) {
        await fail(current.message);
        if (current.reason === 'SESSION_INVALID') return 'session-invalid';
        continue;
      }
      const existing = findImageTags(current.html)[0];
      const size = existing ? imageSizeOf(existing) : null;
      if (!existing || !size) {
        console.warn('⚠️', label, '대문에서 이미지 블록이 사라짐 — 동작 중지');
        await fail('대문에서 방송 상태 이미지가 사라졌습니다. 연동 설정에서 위치를 다시 지정해주세요.', { missing: true, html: current.html });
        continue;
      }
      const replaced = replaceImageTags(current.html, buildImageTag({ src: save.src, ...size }));
      const saved = await writeGate(cookies, row.clubId, replaced.html);
      if (!saved.ok) {
        await fail(saved.message);
        if (saved.reason === 'SESSION_INVALID') return 'session-invalid';
        continue;
      }
      const written = findImageTags(saved.html).some((tag) => imageSrcOf(tag)?.endsWith(`?v=${save.serial}`));
      if (!written) {
        await fail('저장했지만 대문에서 새 이미지 주소가 보이지 않습니다. 다음 주기에 다시 시도합니다.', { html: saved.html });
        continue;
      }
      await trpc.cafe.reportSave.mutate({ id: row.id, ok: true, serial: save.serial, html: saved.html });
      console.log('🖼️', label, `대문 갱신 v${save.serial} (${save.reason}) — ${snapshot.live ? `방송 중 · ${snapshot.title} · ${snapshot.viewers}명` : '방송 종료'}`);
    } catch (error) {
      console.error('❌', label, '대문 갱신 오류:', error);
      await fail(`대문 갱신 중 오류: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500));
    }
  }
}

/** 세션 검사. 돌려주는 값 = 지금 이 세션으로 일해도 되는가 */
async function syncSession(session: BotSession): Promise<boolean> {
  // 어드민이 방금 저장한 세션(checkedAt 이 없거나 updatedAt 보다 이전)은 주기와 무관하게 바로 검사한다
  const fresh = !session.checkedAt || new Date(session.checkedAt) < new Date(session.updatedAt);
  if (!fresh && Date.now() - lastSessionCheckAt < SESSION_CHECK_MS) return session.valid !== false;
  lastSessionCheckAt = Date.now();
  const result = await checkSession(session);
  const { transition } = await trpc.cafe.reportSessionCheck.mutate({ valid: result.ok, message: result.ok ? null : result.message });
  console.log(result.ok ? '🔐 네이버 세션 유효' : `🔒 네이버 세션 무효: ${result.message}`);
  if (transition === 'expired') console.warn('📧 운영자에게 세션 만료 알림을 보냈습니다.');
  if (transition === 'recovered') console.log('✅ 세션이 복구됐습니다 — 밀린 작업을 재개합니다.');
  return result.ok;
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
    if (!(await syncSession(session))) {
      // 만료된 세션으로는 모든 요청이 로그인 페이지로 튕긴다 — 어드민이 새 쿠키를 넣으면(updatedAt 갱신) 바로 재검사·재개
      console.warn('⏸ 네이버 세션이 만료돼 작업을 쉽니다 — 어드민 > 네이버 봇 계정에서 쿠키를 갱신해주세요.');
      lastPollAt = new Date();
      return;
    }
    await processActions(session);
    if ((await syncLive(session)) === 'session-invalid') {
      await trpc.cafe.reportSessionCheck.mutate({ valid: false, message: '봇 계정의 네이버 세션이 만료됐습니다.' });
      lastSessionCheckAt = Date.now();
    }
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

/* eslint-disable no-console */
import { type GateBox, GATE_RENDER_WIDTH, type GatePicks, type GatePlan, IMAGE_TAG_SELECTOR, YOUTUBE_TAG_SELECTOR } from '@wizbot/shared/lib/cafeGate';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer';

/**
 * 네이버 카페 접속 (#9). 참고 구현(naver-cafe-gate-automation)의 puppeteer 흐름을 옮겼다.
 *
 * ⚠ 전부 네이버 내부 페이지의 마크업에 기댄다 — 바뀌면 깨진다. 실패는 조용히 넘기지 않고
 *   상태 메시지로 콘솔(스트리머·어드민)에 노출한다.
 */

export type NaverCookies = { nidAut: string; nidSes: string };

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const NAV_TIMEOUT = 30_000;

const GATE_URL = (clubId: string) => `https://cafe.naver.com/ManageGateEditor.nhn?clubid=${clubId}`;

let browser: Browser | null = null;

/** 브라우저 하나를 재사용한다 — 매번 띄우면 요청당 수 초가 든다 */
async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return browser;
}

export async function closeBrowser() {
  await browser?.close().catch(() => null);
  browser = null;
}

/** 쿠키를 심은 새 페이지로 fn 을 실행하고 닫는다 */
export async function withPage<T>(cookies: NaverCookies, fn: (page: Page) => Promise<T>): Promise<T> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setUserAgent(UA);
    await page.setCookie(
      { name: 'NID_AUT', value: cookies.nidAut, domain: '.naver.com', path: '/' },
      { name: 'NID_SES', value: cookies.nidSes, domain: '.naver.com', path: '/' },
    );
    // 확인창은 전부 승인 — 저장 시 "수정하시겠습니까?" 류
    page.on('dialog', (dialog) => void dialog.accept());
    return await fn(page);
  } finally {
    await page.close().catch(() => null);
  }
}

/** 네이버 로그인 페이지로 튕겼는가 — 세션 만료의 판정 기준 (실측: 비로그인 편집기 접근 → nidlogin) */
function bouncedToLogin(page: Page): boolean {
  return /nid\.naver\.com\/nidlogin/i.test(page.url());
}

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: 'SESSION_INVALID' | 'NO_PERMISSION' | 'UNKNOWN'; message: string };

/** 세션 검사용 카페 — 연동된 카페가 하나도 없을 때. 공개 카페면 어디든 된다(권한이 없어도 로그인으로 튕기지만 않으면 유효) */
const PROBE_CLUB_ID = '29569242';

/**
 * 세션 유효성 — 대문 편집기를 열어 로그인 페이지로 튕기는지 본다.
 * 실측 (2026-08-30): 쿠키가 없거나 깨지면 `nid.naver.com/nidlogin.login` 으로 302. 유효하지만 권한이 없으면
 * "권한이 없습니다" 알림 후 카페 홈(로그인 아님). ⚠ `MyCafeIntro.nhn` 은 쿠키와 무관하게 "등록된 네이버 카페가
 * 아닙니다" 200 을 주는 죽은 페이지라 판정에 쓸 수 없다 — 그걸 써서 항상 유효로 나오던 버그가 있었다.
 */
export async function checkSession(cookies: NaverCookies, clubId: string | null = null): Promise<CheckResult> {
  return withPage(cookies, async (page) => {
    await page.goto(GATE_URL(clubId ?? PROBE_CLUB_ID), { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    if (bouncedToLogin(page)) {
      return { ok: false, reason: 'SESSION_INVALID', message: '네이버 로그인 페이지로 이동했습니다 — 쿠키가 만료됐습니다.' };
    }
    return { ok: true };
  });
}

/**
 * 대문 편집기 접근 가능 여부 = 봇이 그 카페에서 대문을 편집할 수 있는가.
 * 실측(2026-08-29, 테스트 카페):
 *   - 미승인/멤버 : "권한이 없습니다." 알림 후 카페 홈으로 리다이렉트, 편집기 없음
 *   - 디자인 스탭 : ManageGateEditor 에 머물고 iframe(cafe_main) 안에 #elHtmlMode — 매니저가 아니어도 된다
 * 권한이 없을 때는 카페 홈 텍스트로 단계를 구분한다: "가입 대기중" → 승인 대기, "카페 글쓰기" → 멤버.
 */
export async function verifyGateAccess(cookies: NaverCookies, clubId: string): Promise<CheckResult> {
  return withPage(cookies, async (page) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    await page.goto(`https://cafe.naver.com/ManageGateEditor.nhn?clubid=${clubId}`, {
      waitUntil: 'networkidle0',
      timeout: NAV_TIMEOUT,
    });
    if (bouncedToLogin(page)) {
      return { ok: false, reason: 'SESSION_INVALID', message: '봇 계정의 네이버 세션이 만료됐습니다. 관리자에게 문의해주세요.' };
    }
    const frameHandle = await page.$('iframe[name="cafe_main"]');
    const frame = frameHandle ? await frameHandle.contentFrame() : null;
    const hasEditor = frame ? !!(await frame.$('#elHtmlMode')) : false;
    if (hasEditor) return { ok: true };

    const text = (await page.evaluate(() => document.body?.innerText ?? '')).replace(/\s+/g, ' ');
    const denied = dialogs.some((m) => m.includes('권한')) || /권한이 없/.test(text);
    let message: string;
    if (/가입 대기중/.test(text)) {
      message = '봇의 가입 신청이 아직 승인되지 않았습니다. 카페 관리 → 멤버 관리에서 승인한 뒤 디자인 스탭(또는 매니저)으로 지정해주세요.';
    } else if (/카페 글쓰기/.test(text)) {
      message = '봇이 카페 멤버이지만 대문 편집 권한이 없습니다. 카페 관리 → 스탭 관리에서 디자인 스탭(또는 매니저)으로 지정해주세요.';
    } else if (denied) {
      message = '봇이 아직 카페 멤버가 아닙니다. 「봇 가입 신청」으로 운영자에게 가입을 요청해주세요.';
    } else {
      message = `대문 편집기를 열 수 없습니다. (${text.slice(0, 120) || page.url()})`;
    }
    return { ok: false, reason: 'NO_PERMISSION', message };
  });
}

/* ── 대문 HTML 읽기·쓰기 (#9 PR3) ── */

export type GateResult = { ok: true; html: string } | Exclude<CheckResult, { ok: true }>;


/**
 * 편집기를 열어 HTML 모드로 전환하고 textarea 를 돌려준다.
 * 실측 (2026-08-31): iframe(cafe_main) → Gate.nhn?m=viewEditorIframe, 폼 frmWrite 가 Gate.nhn 으로 POST,
 * 저장 버튼 `a._click(ManageGateEditor|Submit)` 은 바깥 페이지에 있다. 저장 1회 ≈ 0.4초.
 */
async function openHtmlMode(page: Page, clubId: string): Promise<{ ok: true; textarea: ElementHandle<HTMLTextAreaElement> } | Exclude<CheckResult, { ok: true }>> {
  await page.goto(GATE_URL(clubId), { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
  if (bouncedToLogin(page)) {
    return { ok: false, reason: 'SESSION_INVALID', message: '봇 계정의 네이버 세션이 만료됐습니다. 관리자에게 문의해주세요.' };
  }
  const frameHandle = await page.$('iframe[name="cafe_main"]');
  const frame = frameHandle ? await frameHandle.contentFrame() : null;
  const button = frame ? await frame.$('#elHtmlMode') : null;
  if (!frame || !button) {
    return { ok: false, reason: 'NO_PERMISSION', message: '대문 편집기를 열 수 없습니다. 봇의 디자인 스탭 권한을 확인해주세요.' };
  }
  await button.click();
  const textarea = (await frame.waitForSelector('textarea[name="content"]', { timeout: NAV_TIMEOUT })) as ElementHandle<HTMLTextAreaElement> | null;
  if (!textarea) return { ok: false, reason: 'UNKNOWN', message: 'HTML 편집 모드로 전환하지 못했습니다.' };
  return { ok: true, textarea };
}

export async function readGate(cookies: NaverCookies, clubId: string): Promise<GateResult> {
  return withPage(cookies, async (page) => {
    const opened = await openHtmlMode(page, clubId);
    if (!opened.ok) return opened;
    return { ok: true, html: await opened.textarea.evaluate((el) => el.value) };
  });
}

/** HTML 모드에 값을 넣고 저장한 뒤, 다시 열어 실제로 저장된 HTML 을 돌려준다 (네이버가 손댄 결과) */
export async function writeGate(cookies: NaverCookies, clubId: string, html: string): Promise<GateResult> {
  return withPage(cookies, async (page) => {
    const opened = await openHtmlMode(page, clubId);
    if (!opened.ok) return opened;
    await opened.textarea.evaluate((el, value) => { el.value = value; }, html);
    await Promise.all([
      page.waitForNavigation({ timeout: NAV_TIMEOUT }),
      page.click('a._click\\(ManageGateEditor\\|Submit\\)'),
    ]);
    const reopened = await openHtmlMode(page, clubId);
    if (!reopened.ok) return reopened;
    return { ok: true, html: await reopened.textarea.evaluate((el) => el.value) };
  });
}

export type GateRender = { png: string; width: number; height: number; boxes: GateBox[] };

/** 렌더 높이 상한 — 스크린샷·DB 크기를 막는다 */
const RENDER_MAX_HEIGHT = 6000;

/**
 * 대문 HTML 을 네이버 대문 폭(836px)으로 렌더해 스크린샷과 요소 좌표를 뽑는다 (#9).
 * 실측 (2026-09-01): 카페 이미지 서버(cafefiles.pstatic.net)는 Referer 검사를 하므로 cafe.naver.com 을 붙여야 200.
 * 콘솔에서 직접 렌더하면 403·CSP·폭 불일치가 나서 워커가 그린다. 요소 경로는 body 자식 인덱스 —
 * 콘솔이 같은 HTML 을 DOMParser 로 파싱하면 같은 트리가 나오므로 그 경로로 교체한다.
 */
export async function renderGate(html: string): Promise<GateRender | null> {
  if (!html.trim()) return null;
  const page = await (await getBrowser()).newPage();
  try {
    await page.setUserAgent(UA);
    await page.setViewport({ width: GATE_RENDER_WIDTH, height: 600, deviceScaleFactor: 1 });
    await page.setExtraHTTPHeaders({ Referer: 'https://cafe.naver.com/' });
    const safe = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}body{width:${GATE_RENDER_WIDTH}px;overflow-x:hidden}img{max-width:100%}</style></head><body>${safe}</body></html>`;
    // 유튜브 embed 의 광고 요청 등으로 idle 이 안 올 수 있다 — 시간 내 안 오면 그대로 찍는다
    await page.setContent(doc, { waitUntil: 'load', timeout: 20_000 }).catch(() => null);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => null);
    const size = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
    const height = Math.min(RENDER_MAX_HEIGHT, Math.max(1, size.h));
    await page.setViewport({ width: GATE_RENDER_WIDTH, height, deviceScaleFactor: 1 });
    const boxes = await page.evaluate((maxH: number, imageSel: string, youtubeSel: string) => {
      const out: GateBox[] = [];
      const walk = (el: Element, path: number[]) => {
        const b = el.getBoundingClientRect();
        const y = Math.round(b.y + window.scrollY);
        //  줄바꿈·빈 요소는 고를 수 없다
        if (el.tagName !== 'BR' && b.width >= 1 && b.height >= 1 && y < maxH) {
          const marker = el.matches(imageSel) ? 'image' : el.matches(youtubeSel) ? 'youtube' : undefined;
          out.push({ path, tag: el.tagName.toLowerCase(), x: Math.round(b.x), y, w: Math.round(b.width), h: Math.round(b.height), ...(marker ? { marker } : {}) });
        }
        Array.from(el.children).forEach((c, i) => walk(c, [...path, i]));
      };
      Array.from(document.body.children).forEach((c, i) => walk(c, [i]));
      return out;
    }, height, IMAGE_TAG_SELECTOR, YOUTUBE_TAG_SELECTOR);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: GATE_RENDER_WIDTH, height }, encoding: 'base64' });
    return { png: String(png), width: GATE_RENDER_WIDTH, height, boxes };
  } finally {
    await page.close().catch(() => null);
  }
}

export type ApplyResult = { ok: true; html: string; picks: GatePicks; changed: boolean } | { ok: false; message: string };

/**
 * 반영 계획을 DOM 에서 실행한다 (#9). 렌더와 같은 크로미움 파서라 콘솔이 고른 경로가 같은 요소를 가리킨다.
 * - replace: 고른 요소를 블록으로 교체. 다른 곳에 남은 옛 블록은 지운다(중복 방지)
 * - remove : 들어 있는 블록 제거 (이미지는 <p><a><img></a></p> 껍데기까지)
 * - 설정 미완으로 아직 안 넣은 자리는 교체 뒤의 새 경로로 돌려준다
 */
export async function applyGatePlan(html: string, plan: GatePlan, picks: GatePicks): Promise<ApplyResult> {
  const page = await (await getBrowser()).newPage();
  try {
    return await page.evaluate(
      (html: string, plan: GatePlan, picks: GatePicks, imageSel: string, youtubeSel: string): ApplyResult => {
        const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
        const body = doc.body;
        const resolve = (path: number[]): Element | null => {
          let cur: Element | null = body;
          for (const i of path) { cur = cur?.children[i] ?? null; if (!cur) return null; }
          return cur === body ? null : cur;
        };
        const pathOf = (el: Element): number[] | null => {
          const path: number[] = [];
          let cur: Element | null = el;
          while (cur && cur !== body) {
            const parent: Element | null = cur.parentElement;
            if (!parent) return null;
            path.unshift(Array.prototype.indexOf.call(parent.children, cur));
            cur = parent;
          }
          return cur === body ? path : null;
        };
        const target = { image: typeof picks.image === 'object' && picks.image ? resolve(picks.image.path) : null, youtube: typeof picks.youtube === 'object' && picks.youtube ? resolve(picks.youtube.path) : null };
        if (typeof picks.image === 'object' && picks.image && !target.image) return { ok: false, message: '이미지 자리로 고른 요소를 대문에서 찾지 못했습니다. 대문을 다시 가져와 골라주세요.' };
        if (typeof picks.youtube === 'object' && picks.youtube && !target.youtube) return { ok: false, message: '유튜브 자리로 고른 요소를 대문에서 찾지 못했습니다. 대문을 다시 가져와 골라주세요.' };

        let changed = false;
        const removeImageBlocks = (except: Node[]) => {
          for (const img of Array.from(body.querySelectorAll(imageSel))) {
            if (except.some((n) => n === img || n.contains(img))) continue;
            const a = img.parentElement?.tagName === 'A' && img.parentElement.children.length === 1 ? img.parentElement : img;
            const p = a.parentElement?.tagName === 'P' && a.parentElement.children.length === 1 && !(a.parentElement.textContent ?? '').trim() ? a.parentElement : a;
            p.remove(); changed = true;
          }
        };
        const removeYoutubeBlocks = (except: Node[]) => {
          for (const f of Array.from(body.querySelectorAll(youtubeSel))) {
            if (except.some((n) => n === f || n.contains(f))) continue;
            f.remove(); changed = true;
          }
        };
        const insert = (el: Element, markup: string, after: boolean): Node[] => {
          const frag = doc.createRange().createContextualFragment(markup);
          const nodes = Array.from(frag.childNodes);
          if (after) el.after(frag); else el.replaceWith(frag);
          changed = true;
          return nodes;
        };

        const next: GatePicks = { image: picks.image, youtube: picks.youtube };
        let imageNodes: Node[] = [];
        let youtubeNodes: Node[] = [];
        const sameTarget = !!target.image && target.image === target.youtube;
        if (plan.image?.kind === 'replace' && target.image) {
          imageNodes = insert(target.image, plan.image.html, false);
          next.image = null;
        }
        if (plan.youtube?.kind === 'replace' && target.youtube) {
          //  같은 요소를 골랐으면 이미지 뒤에 붙인다 (이미 교체돼 사라졌으므로)
          const anchor = sameTarget && imageNodes.length ? (imageNodes[imageNodes.length - 1] as Element) : target.youtube;
          youtubeNodes = insert(anchor, plan.youtube.html, sameTarget && imageNodes.length > 0);
          next.youtube = null;
        }
        if (plan.image?.kind === 'replace' || plan.image?.kind === 'remove') removeImageBlocks(imageNodes);
        if (plan.youtube?.kind === 'replace' || plan.youtube?.kind === 'remove') removeYoutubeBlocks(youtubeNodes);
        if (plan.image?.kind === 'remove') next.image = null;
        if (plan.youtube?.kind === 'remove') next.youtube = null;
        //  아직 안 넣은 자리는 새 경로로 (교체로 밀렸을 수 있다). 사라졌으면 버린다
        for (const key of ['image', 'youtube'] as const) {
          const pick = next[key];
          if (typeof pick !== 'object' || !pick) continue;
          const el = target[key];
          const path = el && body.contains(el) ? pathOf(el) : null;
          next[key] = path ? { ...pick, path } : null;
        }
        return { ok: true, html: body.innerHTML, picks: next, changed };
      },
      html, plan, picks, IMAGE_TAG_SELECTOR, YOUTUBE_TAG_SELECTOR,
    );
  } finally {
    await page.close().catch(() => null);
  }
}

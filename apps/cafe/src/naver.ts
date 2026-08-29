/* eslint-disable no-console */
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

/**
 * 세션 유효성 — 내 카페 목록 페이지를 열어 로그인으로 튕기는지 본다.
 * 어떤 카페의 매니저도 아니어도 열리는 페이지라 권한과 무관하게 세션만 본다.
 */
export async function checkSession(cookies: NaverCookies): Promise<CheckResult> {
  return withPage(cookies, async (page) => {
    await page.goto('https://cafe.naver.com/MyCafeIntro.nhn', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    if (bouncedToLogin(page)) {
      return { ok: false, reason: 'SESSION_INVALID', message: '네이버 로그인 페이지로 이동했습니다 — 쿠키가 만료됐습니다.' };
    }
    return { ok: true };
  });
}

/**
 * 대문 편집기 접근 가능 여부 = 봇이 그 카페의 매니저(대문 편집 권한)인가.
 * 편집기 iframe(cafe_main) 안에 HTML 모드 버튼(#elHtmlMode)이 있으면 권한이 있는 것이다.
 */
export async function verifyGateAccess(cookies: NaverCookies, clubId: string): Promise<CheckResult> {
  return withPage(cookies, async (page) => {
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

    const text = (await page.evaluate(() => document.body?.innerText ?? '')).replace(/\s+/g, ' ').slice(0, 200);
    return {
      ok: false,
      reason: 'NO_PERMISSION',
      message: `대문 편집기를 열 수 없습니다. 봇이 아직 카페 멤버가 아니거나 매니저 권한이 없습니다. (${text || page.url()})`,
    };
  });
}

/**
 * 카페 가입 신청. 가입 페이지는 SPA(ca-fe)라 마크업이 유동적이다 — 최선의 시도이며,
 * 질문·답변이 필수인 카페는 자동 가입이 불가하니 그대로 알린다.
 */
export async function requestJoin(cookies: NaverCookies, clubId: string): Promise<CheckResult> {
  return withPage(cookies, async (page) => {
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${clubId}/join`, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT });
    if (bouncedToLogin(page)) {
      return { ok: false, reason: 'SESSION_INVALID', message: '봇 계정의 네이버 세션이 만료됐습니다. 관리자에게 문의해주세요.' };
    }
    const snapshot = await page.evaluate(() => {
      const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
      const questions = document.querySelectorAll('textarea, input[type="text"]').length;
      const buttons = Array.from(document.querySelectorAll('button, a')).map((el) => (el.textContent ?? '').trim());
      return { text: text.slice(0, 300), questions, buttons };
    });
    if (/이미 가입|가입된 카페|already/i.test(snapshot.text)) return { ok: true };
    if (snapshot.questions > 1) {
      return {
        ok: false,
        reason: 'NO_PERMISSION',
        message: '가입 질문이 있는 카페라 자동 가입할 수 없습니다. 카페 관리에서 봇 계정을 직접 초대·승인해주세요.',
      };
    }
    const submit = await page.evaluateHandle(() => {
      const candidates = Array.from(document.querySelectorAll('button, a'));
      return candidates.find((el) => /가입/.test(el.textContent ?? '') && !/취소/.test(el.textContent ?? '')) ?? null;
    });
    const element = submit.asElement() as ElementHandle<Element> | null;
    if (!element) {
      return {
        ok: false,
        reason: 'UNKNOWN',
        message: `가입 버튼을 찾지 못했습니다. 카페 관리에서 봇 계정을 직접 초대해주세요. (${snapshot.text.slice(0, 120)})`,
      };
    }
    await Promise.all([
      page.waitForNavigation({ timeout: NAV_TIMEOUT }).catch(() => null),
      element.click(),
    ]);
    return { ok: true };
  });
}

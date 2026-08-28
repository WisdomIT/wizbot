import type { ThemeInput } from '@wizbot/shared/lib/theme';

/**
 * 스트리머 테마 → CSS 변수 (#77).
 *
 * globals.css 의 토큰(--primary, --background …)을 래퍼에서 덮으면 하위 shadcn 컴포넌트가 전부
 * 따라간다. 스트리머는 메인 색·배경색 두 가지만 고르고, 나머지 토큰(전경·테두리·muted …)은
 * 여기서 파생한다 — 대비가 깨지지 않게 배경 밝기에서 전경을 정한다.
 *
 * 순수 함수다. 설정 화면의 실시간 미리보기가 클라이언트에서도 같은 결과를 그린다.
 */

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/** WCAG 상대 휘도 (0=검정, 1=흰색) */
export function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 두 색의 대비비 (1 ~ 21). WCAG AA 본문 기준 4.5 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 배경 위에 올릴 전경 — 검정/흰색 중 대비가 큰 쪽 */
function foregroundFor(bg: Rgb): Rgb {
  return luminance(bg) > 0.4 ? [23, 23, 23] : [250, 250, 250];
}

/** a 에 b 를 t 만큼 섞는다 (0 = a, 1 = b) */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

const css = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;

const DEFAULT_BG = { light: [255, 255, 255] as Rgb, dark: [10, 10, 10] as Rgb };

export type ThemeVars = Record<string, string>;

/**
 * 한 스킴(라이트 또는 다크)에 대한 변수 집합.
 * 스트리머가 고르지 않은 항목은 비워 둔다 → globals.css 기본값이 그대로 쓰인다.
 */
export function deriveVars(theme: ThemeInput, dark: boolean): ThemeVars {
  const vars: ThemeVars = {};
  const { backgroundColor, sidebarColor, primaryColor } = theme;
  if (!backgroundColor && !sidebarColor && !primaryColor) return vars;

  //  배경이 정해지지 않았어도 파생색 계산의 기준은 필요하다 — 스킴 기본 배경을 쓴다
  const bg = backgroundColor ? hexToRgb(backgroundColor) : DEFAULT_BG[dark ? 'dark' : 'light'];
  const fg = foregroundFor(bg);

  if (backgroundColor) {
    const lifted = mix(bg, fg, 0.04);
    Object.assign(vars, {
      '--background': css(bg),
      '--foreground': css(fg),
      '--card': css(lifted),
      '--card-foreground': css(fg),
      '--popover': css(lifted),
      '--popover-foreground': css(fg),
      '--secondary': css(mix(bg, fg, 0.06)),
      '--secondary-foreground': css(fg),
      '--muted': css(mix(bg, fg, 0.06)),
      '--muted-foreground': css(mix(bg, fg, 0.6)),
      '--accent': css(mix(bg, fg, 0.06)),
      '--accent-foreground': css(fg),
      '--border': css(mix(bg, fg, 0.12)),
      '--input': css(mix(bg, fg, 0.14)),
    });
  }

  //  사이드바: 직접 고른 색, 아니면 페이지 배경에서 살짝 띄운 색
  if (sidebarColor || backgroundColor) {
    const sidebar = sidebarColor ? hexToRgb(sidebarColor) : mix(bg, fg, 0.02);
    const sidebarFg = foregroundFor(sidebar);
    Object.assign(vars, {
      '--sidebar': css(sidebar),
      '--sidebar-foreground': css(sidebarFg),
      //  hover — 활성(--sidebar-active)과 달리 은은하게
      '--sidebar-accent': css(mix(sidebar, sidebarFg, 0.08)),
      '--sidebar-accent-foreground': css(sidebarFg),
      '--sidebar-border': css(mix(sidebar, sidebarFg, 0.1)),
    });
  }

  //  강조 색: 버튼·활성 메뉴(solid)·명령어 배경
  if (primaryColor) {
    const primary = hexToRgb(primaryColor);
    const onPrimary = foregroundFor(primary);
    Object.assign(vars, {
      '--primary': css(primary),
      '--primary-foreground': css(onPrimary),
      '--ring': css(primary),
      '--sidebar-primary': css(primary),
      '--sidebar-primary-foreground': css(onPrimary),
      '--sidebar-active': css(primary),
      '--sidebar-active-foreground': css(onPrimary),
      '--sidebar-ring': css(primary),
    });
  }
  return vars;
}

function toDeclarations(vars: ThemeVars): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

/**
 * 래퍼 하나에 쓸 <style> 본문. 스킴별로 선택자를 나눈다.
 * - SYSTEM: 라이트 변수를 기본으로, `.dark` 아래에서는 다크 변수
 * - LIGHT / DARK: 방문자 설정과 무관하게 한 팔레트로 고정 (양쪽 선택자에 같은 값)
 */
export function buildThemeCss(theme: ThemeInput, scopeId: string): string {
  const scope = `[data-streamer-theme="${scopeId}"]`;
  const light = deriveVars(theme, false);
  const dark = deriveVars(theme, true);
  const forced = theme.colorScheme === 'LIGHT' ? light : theme.colorScheme === 'DARK' ? dark : null;

  const base = forced ?? light;
  const inDark = forced ?? dark;
  const rules: string[] = [];
  if (Object.keys(base).length) rules.push(`${scope}{${toDeclarations(base)}}`);
  if (Object.keys(inDark).length) rules.push(`.dark ${scope}{${toDeclarations(inDark)}}`);
  return rules.join('\n');
}

/** 고른 색 위에 파생 글자색(검정/흰색)을 올렸을 때의 대비 — 설정 화면이 경고를 띄우는 기준 */
export function surfaceContrast(color: string): number {
  const rgb = hexToRgb(color);
  return contrastRatio(rgb, foregroundFor(rgb));
}

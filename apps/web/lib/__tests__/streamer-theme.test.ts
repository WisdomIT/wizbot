import { describe, expect, it } from 'vitest';

import {
  buildThemeCss,
  contrastRatio,
  deriveVars,
  hexToRgb,
  luminance,
  surfaceContrast,
} from '../streamer-theme';

const base = {
  primaryColor: null,
  backgroundColor: null,
  sidebarColor: null,
  colorScheme: 'SYSTEM' as const,
  fontKey: 'suit' as const,
};

describe('색 계산', () => {
  it('hex → rgb', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
  });
  it('휘도: 흰색 1, 검정 0', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
    expect(luminance([0, 0, 0])).toBe(0);
  });
  it('대비비: 흰/검 21, 같은 색 1', () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21);
    expect(contrastRatio([100, 100, 100], [100, 100, 100])).toBe(1);
  });
});

describe('deriveVars — 고른 것만 덮는다', () => {
  it('아무것도 안 골랐으면 빈 객체 (globals.css 기본값 유지)', () => {
    expect(deriveVars(base, false)).toEqual({});
  });
  it('강조 색만 고르면 primary 계열 + 활성 메뉴(solid)만, 배경·사이드바 계열은 없다', () => {
    const vars = deriveVars({ ...base, primaryColor: '#1e90ff' }, false);
    expect(vars['--primary']).toBe('rgb(30 144 255)');
    expect(vars['--sidebar-active']).toBe('rgb(30 144 255)');
    expect(vars).toHaveProperty('--ring');
    expect(vars).not.toHaveProperty('--background');
    expect(vars).not.toHaveProperty('--sidebar');
  });
  it('사이드바 색을 직접 고르면 그 색, 아니면 배경에서 살짝 띄운 색', () => {
    expect(deriveVars({ ...base, sidebarColor: '#112233' }, false)['--sidebar']).toBe('rgb(17 34 51)');
    const derived = deriveVars({ ...base, backgroundColor: '#ffffff' }, false);
    expect(derived['--sidebar']).toBe('rgb(250 250 250)');
  });
  it('사이드바 hover(accent)는 활성(active)보다 은은하다 — 같은 토큰을 쓰지 않는다', () => {
    const vars = deriveVars({ ...base, sidebarColor: '#ffffff', primaryColor: '#ff0000' }, false);
    expect(vars['--sidebar-active']).toBe('rgb(255 0 0)');
    expect(vars['--sidebar-accent']).not.toBe(vars['--sidebar-active']);
  });
  it('어두운 배경이면 전경이 밝게, 밝은 배경이면 어둡게', () => {
    expect(deriveVars({ ...base, backgroundColor: '#101010' }, false)['--foreground']).toBe('rgb(250 250 250)');
    expect(deriveVars({ ...base, backgroundColor: '#fafafa' }, true)['--foreground']).toBe('rgb(23 23 23)');
  });
  it('메인 색 위 글자색은 대비가 큰 쪽 — 노랑 위엔 검정, 남색 위엔 흰색', () => {
    expect(deriveVars({ ...base, primaryColor: '#ffee00' }, false)['--primary-foreground']).toBe('rgb(23 23 23)');
    expect(deriveVars({ ...base, primaryColor: '#101060' }, false)['--primary-foreground']).toBe('rgb(250 250 250)');
  });
  it('파생 배경(muted)은 배경과 전경 사이 — 배경보다 전경 쪽으로 조금', () => {
    const vars = deriveVars({ ...base, backgroundColor: '#ffffff' }, false);
    expect(vars['--muted']).toBe('rgb(241 241 241)');
    expect(vars['--muted-foreground']).toBe('rgb(116 116 116)');
  });
});

describe('buildThemeCss — 스킴별 선택자', () => {
  const theme = { ...base, backgroundColor: '#123456', primaryColor: '#abcdef' };
  it('SYSTEM: 기본 선택자 + .dark 선택자 (다크에서는 다크 기준 파생)', () => {
    const css = buildThemeCss({ ...theme, colorScheme: 'SYSTEM' }, 'x');
    expect(css).toContain('[data-streamer-theme="x"]{');
    expect(css).toContain('.dark [data-streamer-theme="x"]{');
  });
  it('LIGHT 고정: 두 선택자에 같은 라이트 값', () => {
    const css = buildThemeCss({ ...theme, colorScheme: 'LIGHT' }, 'x');
    const [a, b] = css.split('\n').map((rule) => rule.slice(rule.indexOf('{')));
    expect(a).toBe(b);
  });
  it('고른 게 없으면 빈 문자열', () => {
    expect(buildThemeCss(base, 'x')).toBe('');
  });
  it('scopeId 로 선택자가 갈린다 — 미리보기와 실제 래퍼가 겹치지 않는다', () => {
    expect(buildThemeCss(theme, 'preview')).not.toContain('"streamer"');
  });
});

describe('경고 기준', () => {
  it('중간 회색은 어느 글자색을 올려도 대비가 낮다', () => {
    expect(surfaceContrast('#808080')).toBeLessThan(4.5);
    expect(surfaceContrast('#ffffff')).toBeGreaterThan(4.5);
  });
});

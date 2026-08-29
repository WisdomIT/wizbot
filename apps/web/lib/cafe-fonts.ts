import 'server-only';

import { existsSync } from 'node:fs';
import path from 'node:path';

import { GlobalFonts } from '@napi-rs/canvas';
import type { ThemeFontKey } from '@wizbot/shared/lib/theme';

/**
 * 카페 이미지 렌더용 폰트 등록 (#9 PR2).
 *
 * 계정 설정 테마와 같은 13종을 apps/web/fonts 에 vendoring 했다(OFL). SUIT 는 TTF 가 아직 없어
 * Noto Sans CJK KR 로 그린다. 이모지·희귀 한글은 이미지에 apt 로 넣는 Noto Sans CJK / Noto Color
 * Emoji 로 글자 단위 폴백한다 — 실측(2026-08-29): 폴백 체인 없이는 이모지와 "똠" 이 □ 로 나온다.
 */

/** standalone 은 apps/web 으로 chdir 하지만, 다른 실행 방식(모노레포 루트)도 대비한다 */
const FONT_DIR = [path.join(process.cwd(), 'fonts'), path.join(process.cwd(), 'apps/web/fonts')].find((dir) => existsSync(dir)) ?? path.join(process.cwd(), 'fonts');

/** 키 → [파일, family]. 굵기는 Regular/Bold 파일 또는 변수 폰트 */
const FILES: Record<ThemeFontKey, { family: string; files: string[] }> = {
  suit: { family: 'Noto Sans CJK KR', files: [] },
  'noto-sans-kr': { family: 'Noto Sans KR', files: ['NotoSansKR[wght].ttf'] },
  'nanum-gothic': { family: 'Nanum Gothic', files: ['NanumGothic-Regular.ttf', 'NanumGothic-Bold.ttf'] },
  'nanum-myeongjo': { family: 'Nanum Myeongjo', files: ['NanumMyeongjo-Regular.ttf', 'NanumMyeongjo-Bold.ttf'] },
  'black-han-sans': { family: 'Black Han Sans', files: ['BlackHanSans-Regular.ttf'] },
  'nanum-pen-script': { family: 'Nanum Pen Script', files: ['NanumPenScript-Regular.ttf'] },
  dongle: { family: 'Dongle', files: ['Dongle-Regular.ttf', 'Dongle-Bold.ttf'] },
  jua: { family: 'Jua', files: ['Jua-Regular.ttf'] },
  hahmlet: { family: 'Hahmlet', files: ['Hahmlet[wght].ttf'] },
  gaegu: { family: 'Gaegu', files: ['Gaegu-Regular.ttf', 'Gaegu-Bold.ttf'] },
  'poor-story': { family: 'Poor Story', files: ['PoorStory-Regular.ttf'] },
  'gamja-flower': { family: 'Gamja Flower', files: ['GamjaFlower-Regular.ttf'] },
  'yeon-sung': { family: 'Yeon Sung', files: ['YeonSung-Regular.ttf'] },
  orbit: { family: 'Orbit', files: ['Orbit-Regular.ttf'] },
};

/** 시스템 폴백 폰트 (Dockerfile 의 apt: fonts-noto-cjk, fonts-noto-color-emoji) */
const SYSTEM_FALLBACKS = [
  { family: 'Noto Sans CJK KR', paths: ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'] },
  { family: 'Noto Color Emoji', paths: ['/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'] },
];

let registered = false;
const missing: string[] = [];

/** 프로세스당 한 번. 없는 파일은 건너뛰고 기록한다 — 렌더가 죽는 것보다 폴백으로 그리는 게 낫다 */
export function ensureFontsRegistered(): { missing: string[] } {
  if (registered) return { missing };
  registered = true;
  for (const { family, files } of Object.values(FILES)) {
    for (const file of files) {
      const full = path.join(FONT_DIR, file);
      if (existsSync(full)) GlobalFonts.registerFromPath(full, family);
      else missing.push(file);
    }
  }
  for (const { family, paths } of SYSTEM_FALLBACKS) {
    for (const full of paths) {
      if (existsSync(full)) GlobalFonts.registerFromPath(full, family);
      else missing.push(full);
    }
  }
  return { missing };
}

/** canvas ctx.font 에 넣을 family 목록 — 선택 폰트 → CJK → 이모지 순으로 글자 단위 폴백 */
export function fontFamilyChain(key: ThemeFontKey): string {
  const own = FILES[key].family;
  const chain = [own, 'Noto Sans CJK KR', 'Noto Color Emoji'];
  return [...new Set(chain)].map((f) => `"${f}"`).join(', ');
}

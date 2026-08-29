import { describe, expect, it } from 'vitest';

import { cafeLayoutSchema, elementText, EMPTY_LAYOUT, formatKst } from '../../lib/cafeLayout';
import { imageSize } from '../cafe';

describe('cafeLayout 스키마', () => {
  it('빈 입력은 기본 장면 두 개(1200×400, 요소 없음)', () => {
    expect(EMPTY_LAYOUT.live).toEqual({ width: 836, height: 300, elements: [] });
    expect(EMPTY_LAYOUT.offline.elements).toEqual([]);
  });
  it('텍스트 요소의 기본값이 채워진다', () => {
    const layout = cafeLayoutSchema.parse({ live: { elements: [{ id: 'a', kind: 'title', x: 0, y: 0, w: 100, h: 40 }] } });
    expect(layout.live.elements[0]).toMatchObject({ fontKey: 'suit', weight: 400, color: '#ffffff', align: 'left', fontSize: null, lines: 1 });
    expect(() => cafeLayoutSchema.parse({ live: { width: 2048 } })).toThrow(); // 카페 대문 최대 폭 초과
  });
  it('모르는 종류·잘못된 색은 거부', () => {
    expect(() => cafeLayoutSchema.parse({ live: { elements: [{ id: 'a', kind: 'logo', x: 0, y: 0, w: 1, h: 1 }] } })).toThrow();
    expect(() => cafeLayoutSchema.parse({ live: { elements: [{ id: 'a', kind: 'title', x: 0, y: 0, w: 1, h: 1, color: 'red' }] } })).toThrow();
  });
});

describe('formatKst — 서버·브라우저 어디서든 같은 KST 표기', () => {
  const iso = '2026-08-29T11:30:00.000Z'; // KST 20:30
  it.each([
    ['time', '20:30'],
    ['md-time', '8/29 20:30'],
    ['kr-md-time', '8월 29일 20:30'],
    ['ymd-time', '2026.08.29 20:30'],
  ] as const)('%s → %s', (format, expected) => {
    expect(formatKst(iso, format)).toBe(expected);
  });
  it('날짜 경계를 넘는다 (UTC 16:00 = KST 다음날 01:00)', () => {
    expect(formatKst('2026-08-29T16:00:00.000Z', 'md-time')).toBe('8/30 01:00');
  });
  it('잘못된 값은 빈 문자열', () => {
    expect(formatKst('nope', 'time')).toBe('');
  });
});

describe('elementText', () => {
  const base = { id: 'x', kind: 'viewers' as const, x: 0, y: 0, w: 1, h: 1, fontKey: 'suit' as const, weight: 400 as const, color: '#fff', align: 'left' as const, fontSize: null, timeFormat: 'time' as const, suffix: '명', lines: 1 };
  const snapshot = { live: true, title: 'T', category: 'C', viewers: 12345, openedAt: '2026-08-29T11:30:00.000Z', thumbnailUrl: null };
  it('시청자 수는 천 단위 구분 + 접미사', () => {
    expect(elementText('viewers', snapshot, base)).toBe('12,345명');
  });
  it('시작 시간은 KST, 없으면 빈 문자열', () => {
    expect(elementText('openedAt', snapshot, { ...base, kind: 'openedAt' })).toBe('20:30');
    expect(elementText('openedAt', { ...snapshot, openedAt: null }, { ...base, kind: 'openedAt' })).toBe('');
  });
});

describe('imageSize — 업로드 검증용 최소 파서', () => {
  it('PNG 헤더', () => {
    const png = Buffer.alloc(32);
    png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1200, 16); png.writeUInt32BE(400, 20);
    expect(imageSize(png)).toEqual({ width: 1200, height: 400, mimeType: 'image/png' });
  });
  it('JPEG SOF0', () => {
    // FFD8 + APP0(길이 4) + SOF0(길이 17: precision, height, width …)
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x04, 0xb0, 0x03]);
    expect(imageSize(jpg)).toEqual({ height: 400, width: 1200, mimeType: 'image/jpeg' });
  });
  it('그 외는 null', () => {
    expect(imageSize(Buffer.from('GIF89a'))).toBeNull();
  });
});

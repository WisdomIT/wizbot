import { z } from 'zod';

import { THEME_FONT_KEYS } from './theme';

/**
 * 카페 대문 이미지 레이아웃 (#9 PR2).
 *
 * 스트리머가 에디터로 배치한 결과. 도형은 없다 — 장식은 배경 이미지에 이미 그려져 있고,
 * 여기엔 "이 영역이 제목이다" 같은 텍스트 영역과 썸네일 영역만 있다.
 * 장면은 방송 중 / 종료 둘이고 배경도 각각이다. 캔버스 크기 = 배경 이미지 크기.
 */

/** 네이버 카페 대문 영역의 최대 가로 — 배경은 업로드 전에 이 폭으로 줄인다 */
export const CAFE_MAX_WIDTH = 836;
/** 썸네일 영역은 16:9 고정 */
export const THUMBNAIL_RATIO = 16 / 9;

export const CAFE_SCENES = ['live', 'offline'] as const;
export type CafeScene = (typeof CAFE_SCENES)[number];

export const CAFE_ELEMENT_KINDS = ['title', 'category', 'viewers', 'openedAt', 'thumbnail'] as const;
export type CafeElementKind = (typeof CAFE_ELEMENT_KINDS)[number];

export const CAFE_ELEMENT_LABEL: Record<CafeElementKind, string> = {
  title: '방송 제목',
  category: '카테고리',
  viewers: '시청자 수',
  openedAt: '방송 시작 시간',
  thumbnail: '썸네일',
};

/** 방송 시작 시간 표기 (KST). 키는 ASCII — DB·URL 에 그대로 저장되는 값이라 한글을 키로 쓰지 않는다 */
export const OPENED_AT_FORMATS = {
  time: '20:30',
  'md-time': '8/29 20:30',
  'kr-md-time': '8월 29일 20:30',
  'ymd-time': '2026.08.29 20:30',
} as const;
export type OpenedAtFormat = keyof typeof OPENED_AT_FORMATS;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((v) => v.toLowerCase());
const box = {
  id: z.string().min(1).max(32),
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().positive(),
  h: z.number().positive(),
};

export const textElementSchema = z.object({
  ...box,
  kind: z.enum(['title', 'category', 'viewers', 'openedAt']),
  fontKey: z.enum(THEME_FONT_KEYS).default('suit'),
  /** 700 이면 굵게 */
  weight: z.union([z.literal(400), z.literal(700)]).default(400),
  color: hexColor.default('#ffffff'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  /** null 이면 영역 높이에서 자동. 넘치면 폭에 맞춰 줄이고 그래도 넘치면 ellipsis */
  fontSize: z.number().positive().nullable().default(null),
  /** openedAt 전용 */
  timeFormat: z.enum(Object.keys(OPENED_AT_FORMATS) as [OpenedAtFormat, ...OpenedAtFormat[]]).default('time'),
  /** viewers 전용 — "1,234명" 처럼 뒤에 붙는 단위 */
  suffix: z.string().max(10).default('명'),
  /** 최대 줄 수. 1 이면 한 줄 + ellipsis, 그 이상이면 폭에서 줄바꿈하고 마지막 줄에 ellipsis */
  lines: z.number().int().min(1).max(5).default(1),
});

export const thumbnailElementSchema = z.object({
  ...box,
  kind: z.literal('thumbnail'),
  fit: z.enum(['cover', 'contain']).default('cover'),
  /** 모서리 둥글기(px) */
  radius: z.number().min(0).max(200).default(0),
});

export const cafeElementSchema = z.discriminatedUnion('kind', [
  textElementSchema.extend({ kind: z.literal('title') }),
  textElementSchema.extend({ kind: z.literal('category') }),
  textElementSchema.extend({ kind: z.literal('viewers') }),
  textElementSchema.extend({ kind: z.literal('openedAt') }),
  thumbnailElementSchema,
]);
export type CafeElement = z.infer<typeof cafeElementSchema>;
export type CafeTextElement = Extract<CafeElement, { kind: 'title' | 'category' | 'viewers' | 'openedAt' }>;

export const cafeSceneSchema = z.object({
  /** 배경 이미지 크기 = 캔버스 크기. 배경이 없으면 기본 836×300 (카페 대문 폭). 대문의 <img> 크기는 지정한 요소를 따르므로 제한하지 않는다 */
  width: z.number().int().min(100).max(4000).default(CAFE_MAX_WIDTH),
  height: z.number().int().min(50).max(4000).default(300),
  elements: z.array(cafeElementSchema).max(20).default([]),
});
export type CafeSceneLayout = z.infer<typeof cafeSceneSchema>;

export const cafeLayoutSchema = z.object({
  version: z.literal(1).default(1),
  live: cafeSceneSchema.default({}),
  offline: cafeSceneSchema.default({}),
});
export type CafeLayout = z.infer<typeof cafeLayoutSchema>;

export const EMPTY_LAYOUT: CafeLayout = cafeLayoutSchema.parse({});

/** 렌더에 필요한 방송 상태 — 워커가 저장 시점에 스냅샷으로 남긴다 */
export const cafeSnapshotSchema = z.object({
  live: z.boolean(),
  title: z.string().default(''),
  category: z.string().default(''),
  viewers: z.number().int().min(0).default(0),
  /** ISO 8601 */
  openedAt: z.string().nullable().default(null),
  thumbnailUrl: z.string().url().nullable().default(null),
});
export type CafeSnapshot = z.infer<typeof cafeSnapshotSchema>;

/**
 * 미리보기용 샘플 — 방송을 켜지 않은 상태에서도 배치를 확인할 수 있게. 긴 제목으로 줄바꿈·ellipsis 를 본다.
 * thumbnailUrl 이 없으면 렌더가 자리표시 썸네일을 직접 그린다.
 */
export const SAMPLE_SNAPSHOT: Record<CafeScene, CafeSnapshot> = {
  live: {
    live: true,
    title: '오늘은 신작 게임 엔딩까지 달립니다 🎮 시청자 추천 곡도 받아요, 편하게 놀다 가세요!',
    category: '리그 오브 레전드',
    viewers: 1234,
    openedAt: '2026-08-29T11:30:00.000Z',
    thumbnailUrl: null,
  },
  offline: {
    live: false,
    title: '다음 방송을 기다려주세요',
    category: '',
    viewers: 0,
    openedAt: null,
    thumbnailUrl: null,
  },
};

/** 스냅샷의 필드를 요소 종류에 맞는 문자열로 */
export function elementText(kind: CafeTextElement['kind'], snapshot: CafeSnapshot, element: CafeTextElement): string {
  switch (kind) {
    case 'title':
      return snapshot.title;
    case 'category':
      return snapshot.category;
    case 'viewers':
      return `${snapshot.viewers.toLocaleString('ko-KR')}${element.suffix}`;
    case 'openedAt':
      return snapshot.openedAt ? formatKst(snapshot.openedAt, element.timeFormat) : '';
  }
}

/** ISO → KST 표기. 서버·브라우저 어디서든 같은 결과가 나오도록 타임존을 직접 계산한다 */
export function formatKst(iso: string, format: OpenedAtFormat): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const M = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const HH = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  switch (format) {
    case 'time':
      return `${HH}:${mm}`;
    case 'md-time':
      return `${M}/${d} ${HH}:${mm}`;
    case 'kr-md-time':
      return `${M}월 ${d}일 ${HH}:${mm}`;
    case 'ymd-time':
      return `${yyyy}.${String(M).padStart(2, '0')}.${String(d).padStart(2, '0')} ${HH}:${mm}`;
  }
}

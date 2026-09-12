import { createLucideIcon, type IconNode, type LucideIcon } from 'lucide-react';

/**
 * lucide 1.0 에서 삭제된 브랜드 아이콘 (#268).
 *
 * lucide-react 0.483 → 1.x 로 올리면서 유튜브·트위치 등 브랜드 아이콘 18개가 패키지에서
 * 사라졌다. 스트리머가 링크 아이콘으로 이미 저장해 둔 값('youtube', 'twitch' …)과 아이콘 피커의
 * 큐레이션 목록이 그대로 동작하도록, 0.483 의 SVG 노드 데이터를 옮겨와 같은 createLucideIcon 으로
 * 만든다. 크기·선 굵기·className 등 props 는 lucide 아이콘과 동일하게 동작한다.
 *
 * 원본: lucide-icons/lucide (ISC License) — https://github.com/lucide-icons/lucide/blob/main/LICENSE
 */
const BRAND_ICON_NODES = {
  chrome: [
    ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
    ['circle', { cx: '12', cy: '12', r: '4', key: '4exip2' }],
    ['line', { x1: '21.17', x2: '12', y1: '8', y2: '8', key: 'a0cw5f' }],
    ['line', { x1: '3.95', x2: '8.54', y1: '6.06', y2: '14', key: '1kftof' }],
    ['line', { x1: '10.88', x2: '15.46', y1: '21.94', y2: '14', key: '1ymyh8' }],
  ],
  codepen: [
    ['polygon', { points: '12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2', key: 'srzb37' }],
    ['line', { x1: '12', x2: '12', y1: '22', y2: '15.5', key: '1t73f2' }],
    ['polyline', { points: '22 8.5 12 15.5 2 8.5', key: 'ajlxae' }],
    ['polyline', { points: '2 15.5 12 8.5 22 15.5', key: 'susrui' }],
    ['line', { x1: '12', x2: '12', y1: '2', y2: '8.5', key: '2cldga' }],
  ],
  codesandbox: [
    ['path', { d: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', key: 'yt0hxn' }],
    ['polyline', { points: '7.5 4.21 12 6.81 16.5 4.21', key: 'fabo96' }],
    ['polyline', { points: '7.5 19.79 7.5 14.6 3 12', key: 'z377f1' }],
    ['polyline', { points: '21 12 16.5 14.6 16.5 19.79', key: '9nrev1' }],
    ['polyline', { points: '3.27 6.96 12 12.01 20.73 6.96', key: '1180pa' }],
    ['line', { x1: '12', x2: '12', y1: '22.08', y2: '12', key: '3z3uq6' }],
  ],
  dribbble: [
    ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
    ['path', { d: 'M19.13 5.09C15.22 9.14 10 10.44 2.25 10.94', key: 'hpej1' }],
    ['path', { d: 'M21.75 12.84c-6.62-1.41-12.14 1-16.38 6.32', key: '1tr44o' }],
    ['path', { d: 'M8.56 2.75c4.37 6 6 9.42 8 17.72', key: 'kbh691' }],
  ],
  facebook: [
    ['path', { d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z', key: '1jg4f8' }],
  ],
  figma: [
    ['path', { d: 'M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z', key: '1340ok' }],
    ['path', { d: 'M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z', key: '1hz3m3' }],
    ['path', { d: 'M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z', key: '1oz8n2' }],
    ['path', { d: 'M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z', key: '1ff65i' }],
    ['path', { d: 'M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z', key: 'pdip6e' }],
  ],
  framer: [
    ['path', { d: 'M5 16V9h14V2H5l14 14h-7m-7 0 7 7v-7m-7 0h7', key: '1a2nng' }],
  ],
  github: [
    ['path', { d: 'M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4', key: 'tonef' }],
    ['path', { d: 'M9 18c-4.51 2-5-2-7-2', key: '9comsn' }],
  ],
  gitlab: [
    ['path', { d: 'm22 13.29-3.33-10a.42.42 0 0 0-.14-.18.38.38 0 0 0-.22-.11.39.39 0 0 0-.23.07.42.42 0 0 0-.14.18l-2.26 6.67H8.32L6.1 3.26a.42.42 0 0 0-.1-.18.38.38 0 0 0-.26-.08.39.39 0 0 0-.23.07.42.42 0 0 0-.14.18L2 13.29a.74.74 0 0 0 .27.83L12 21l9.69-6.88a.71.71 0 0 0 .31-.83Z', key: '148pdi' }],
  ],
  instagram: [
    ['rect', { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5', key: '2e1cvw' }],
    ['path', { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', key: '9exkf1' }],
    ['line', { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5', key: 'r4j83e' }],
  ],
  linkedin: [
    ['path', { d: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z', key: 'c2jq9f' }],
    ['rect', { width: '4', height: '12', x: '2', y: '9', key: 'mk3on5' }],
    ['circle', { cx: '4', cy: '4', r: '2', key: 'bt5ra8' }],
  ],
  pocket: [
    ['path', { d: 'M4 3h16a2 2 0 0 1 2 2v6a10 10 0 0 1-10 10A10 10 0 0 1 2 11V5a2 2 0 0 1 2-2z', key: '1mz881' }],
    ['polyline', { points: '8 10 12 14 16 10', key: 'w4mbv5' }],
  ],
  'rail-symbol': [
    ['path', { d: 'M5 15h14', key: 'm0yey3' }],
    ['path', { d: 'M5 9h14', key: '7tsvo6' }],
    ['path', { d: 'm14 20-5-5 6-6-5-5', key: '1jo42i' }],
  ],
  slack: [
    ['rect', { width: '3', height: '8', x: '13', y: '2', rx: '1.5', key: 'diqz80' }],
    ['path', { d: 'M19 8.5V10h1.5A1.5 1.5 0 1 0 19 8.5', key: '183iwg' }],
    ['rect', { width: '3', height: '8', x: '8', y: '14', rx: '1.5', key: 'hqg7r1' }],
    ['path', { d: 'M5 15.5V14H3.5A1.5 1.5 0 1 0 5 15.5', key: '76g71w' }],
    ['rect', { width: '8', height: '3', x: '14', y: '13', rx: '1.5', key: '1kmz0a' }],
    ['path', { d: 'M15.5 19H14v1.5a1.5 1.5 0 1 0 1.5-1.5', key: 'jc4sz0' }],
    ['rect', { width: '8', height: '3', x: '2', y: '8', rx: '1.5', key: '1omvl4' }],
    ['path', { d: 'M8.5 5H10V3.5A1.5 1.5 0 1 0 8.5 5', key: '16f3cl' }],
  ],
  trello: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2', key: '1m3agn' }],
    ['rect', { width: '3', height: '9', x: '7', y: '7', key: '14n3xi' }],
    ['rect', { width: '3', height: '5', x: '14', y: '7', key: 's4azjd' }],
  ],
  twitch: [
    ['path', { d: 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7', key: 'c0yzno' }],
  ],
  twitter: [
    ['path', { d: 'M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z', key: 'pff0z6' }],
  ],
  youtube: [
    ['path', { d: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17', key: '1q2vi4' }],
    ['path', { d: 'm10 15 5-3-5-3z', key: '1jp15x' }],
  ],
} satisfies Record<string, IconNode>;

/** 브랜드 아이콘 이름 (lucide 와 같은 kebab-case) */
export type BrandIconName = keyof typeof BRAND_ICON_NODES;

export const brandIconNames = Object.keys(BRAND_ICON_NODES) as readonly BrandIconName[];

/** 이름 → 컴포넌트. lucide 의 정적 아이콘처럼 즉시 렌더된다 (lazy 청크 없음) */
export const BRAND_ICONS = Object.fromEntries(
  (Object.entries(BRAND_ICON_NODES) as [BrandIconName, IconNode][]).map(([name, node]) => [
    name,
    createLucideIcon(name, node),
  ]),
) as Record<BrandIconName, LucideIcon>;

export function isBrandIconName(name: string): name is BrandIconName {
  return name in BRAND_ICON_NODES;
}

export const Youtube = BRAND_ICONS.youtube;
export const Twitch = BRAND_ICONS.twitch;

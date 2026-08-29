/**
 * 네이버 카페 연동의 순수 함수 (#9) — 네트워크 없이 테스트한다.
 */

/** 카페 주소에서 slug. `https://cafe.naver.com/bighead033/123` · `cafe.naver.com/bighead033` · `bighead033` */
export function parseCafeSlug(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const m = value.match(/^(?:https?:\/\/)?(?:m\.)?cafe\.naver\.com\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{2,30}$/.test(value)) return value;
  return null;
}

/**
 * 카페 첫 페이지 HTML 에서 clubid 와 이름. 페이지는 EUC-KR 이라 호출자가 디코딩해서 넘긴다.
 * (실측 2026-08-29: `g_sClubId = "29569242"`, `<title>빅대숲 (…) : 네이버 카페</title>`)
 */
export function parseClubInfo(html: string): { clubId: string; cafeName: string | null } | null {
  const id = html.match(/g_sClubId\s*=\s*"(\d+)"/) ?? html.match(/clubid=(\d{5,})/i);
  if (!id) return null;
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '';
  const cafeName = title.replace(/\s*:\s*네이버 카페\s*$/, '').trim() || null;
  return { clubId: id[1], cafeName };
}

/** 유튜브 채널 ID — UC 로 시작하는 24자 */
export function isYoutubeChannelId(value: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(value);
}

/** 업로드 재생목록 ID — UC… → UU… */
export function uploadsPlaylistId(channelId: string): string {
  return 'UU' + channelId.slice(2);
}

export const CAFE_LINK_STATUS_LABEL = {
  NONE: '연결 전',
  JOIN_REQUESTED: '운영자 가입 대기',
  JOINED: '가입 신청됨 · 승인 대기',
  JOIN_FAILED: '가입 실패',
  PERMISSION_OK: '권한 확인됨',
  PERMISSION_FAILED: '권한 없음',
  ACTIVE: '동작 중',
} as const;

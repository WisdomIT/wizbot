/**
 * "바로 담기" 대상 즐겨찾기 (#264).
 *
 * 대표(isDefault) 즐겨찾기는 유저당 최대 1개다. 대표가 없으면 첫 번째로 폴백하고,
 * 즐겨찾기가 하나도 없으면 undefined — 호출부는 버튼을 숨긴다.
 * 재생 기록 페이지·미니 플레이어·큰 창 하트 버튼이 같은 규칙을 쓴다.
 */
export function pickDefaultFavorite<T extends { isDefault: boolean }>(
  favorites: readonly T[],
): T | undefined {
  return favorites.find((favorite) => favorite.isDefault) ?? favorites[0];
}

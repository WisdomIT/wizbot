import { describe, expect, it } from 'vitest';

import { pickDefaultFavorite } from '../default-favorite';

describe('pickDefaultFavorite', () => {
  it('대표 즐겨찾기를 고른다 — 순서와 무관하게', () => {
    const favorites = [
      { id: 1, isDefault: false },
      { id: 2, isDefault: true },
      { id: 3, isDefault: false },
    ];
    expect(pickDefaultFavorite(favorites)?.id).toBe(2);
  });

  it('대표가 없으면 첫 번째로 폴백한다', () => {
    const favorites = [
      { id: 7, isDefault: false },
      { id: 8, isDefault: false },
    ];
    expect(pickDefaultFavorite(favorites)?.id).toBe(7);
  });

  it('즐겨찾기가 하나도 없으면 undefined', () => {
    expect(pickDefaultFavorite([])).toBeUndefined();
  });
});

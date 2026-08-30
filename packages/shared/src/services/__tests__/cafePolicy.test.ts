import { describe, expect, it } from 'vitest';

import type { CafeSnapshot } from '../../lib/cafeLayout';
import { bucketChanged, decideSave, viewerBucket } from '../../lib/cafePolicy';

const live: CafeSnapshot = { live: true, title: '제목', category: '롤', viewers: 120, openedAt: '2026-08-29T20:00:00+09:00', thumbnailUrl: null };
const at = (min: number) => new Date(Date.UTC(2026, 7, 29, 11, min, 0));

describe('시청자 구간·히스테리시스 (이슈 §3)', () => {
  it('≤1000 은 50 단위, 초과는 100 단위', () => {
    expect(viewerBucket(0)).toBe(0);
    expect(viewerBucket(149)).toBe(100);
    expect(viewerBucket(1000)).toBe(1000);
    expect(viewerBucket(1099)).toBe(1000);
    expect(viewerBucket(2999)).toBe(2900);
  });
  it('경계를 히스테리시스보다 더 넘어야 변경', () => {
    expect(bucketChanged(2900, 3001)).toBe(false); // 3030 미만
    expect(bucketChanged(2900, 3030)).toBe(true);
    expect(bucketChanged(2900, 2871)).toBe(false); // 2870 이상
    expect(bucketChanged(2900, 2869)).toBe(true);
    expect(bucketChanged(100, 155)).toBe(false); // ≤1000: 10명
    expect(bucketChanged(100, 160)).toBe(true);
    expect(bucketChanged(100, 120)).toBe(false);
    expect(bucketChanged(null, 5)).toBe(true);
  });
});

describe('저장 판정 decideSave', () => {
  it('첫 저장·상태 변화는 즉시', () => {
    expect(decideSave({ snapshot: null, savedAt: null, bucket: null }, live, at(0))).toBe('first');
    expect(decideSave({ snapshot: live, savedAt: at(0), bucket: 100 }, { ...live, title: '다른 제목' }, at(0))).toBe('state');
    expect(decideSave({ snapshot: live, savedAt: at(0), bucket: 100 }, { ...live, live: false }, at(0))).toBe('state');
    expect(decideSave({ snapshot: live, savedAt: at(0), bucket: 100 }, { ...live, category: '발로란트' }, at(0))).toBe('state');
  });
  it('시청자 구간 변경은 1분 뒤부터, 5분이면 강제', () => {
    const prev = { snapshot: live, savedAt: at(0), bucket: 100 };
    expect(decideSave(prev, { ...live, viewers: 300 }, new Date(at(0).getTime() + 30_000))).toBeNull();
    expect(decideSave(prev, { ...live, viewers: 300 }, at(1))).toBe('viewers');
    expect(decideSave(prev, { ...live, viewers: 125 }, at(1))).toBeNull(); // 같은 구간
    expect(decideSave(prev, { ...live, viewers: 125 }, at(5))).toBe('force');
  });
  it('방송 종료 중엔 강제 저장 없음', () => {
    const off = { ...live, live: false, viewers: 0 };
    expect(decideSave({ snapshot: off, savedAt: at(0), bucket: 0 }, off, at(30))).toBeNull();
  });
});

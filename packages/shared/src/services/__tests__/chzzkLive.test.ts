import { describe, expect, it, vi } from 'vitest';

import { fetchLiveSnapshot, kstToIso, normalizeLiveDetail } from '../../lib/chzzkLive';

describe('chzzk live-detail 정규화 (#9)', () => {
  it('OPEN 이면 스냅샷, 썸네일 {type} 을 480 으로', () => {
    expect(
      normalizeLiveDetail({ status: 'OPEN', liveTitle: '제목', liveCategoryValue: '리그 오브 레전드', concurrentUserCount: 12, openDate: '2026-08-29 20:30:00', liveImageUrl: 'https://x/image_{type}.jpg' }),
    ).toEqual({ live: true, title: '제목', category: '리그 오브 레전드', viewers: 12, openedAt: '2026-08-29T20:30:00+09:00', thumbnailUrl: 'https://x/image_480.jpg' });
  });
  it('CLOSE·null 이면 live=false', () => {
    expect(normalizeLiveDetail({ status: 'CLOSE', liveTitle: '지난 제목' }).live).toBe(false);
    expect(normalizeLiveDetail(null).live).toBe(false);
  });
  it('KST 문자열 → ISO(+09:00)', () => {
    expect(kstToIso('2026-08-29 20:30:00')).toBe('2026-08-29T20:30:00+09:00');
    expect(new Date(kstToIso('2026-08-29 20:30:00')!).toISOString()).toBe('2026-08-29T11:30:00.000Z');
    expect(kstToIso('bad')).toBeNull();
  });
  it('네트워크 실패는 null — 미리보기는 샘플로 넘어간다', async () => {
    await expect(fetchLiveSnapshot('c', vi.fn().mockRejectedValue(new Error('down')))).resolves.toBeNull();
    await expect(fetchLiveSnapshot('c', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))).resolves.toBeNull();
  });
});

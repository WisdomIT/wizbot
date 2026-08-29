import type { CafeSnapshot } from '../lib/cafeLayout';

/**
 * 치지직 비공식 API — 특정 채널의 방송 상태 (#9).
 *
 * ⚠ 공식 Open API(chzzk-open-sdk)로는 특정 채널의 방송 여부·시청자 수·썸네일을 얻을 수 없다
 *   (lives 는 channelId 필터가 없고 channels 는 방송 정보가 없다). 그래서 카페 워커와 미리보기는
 *   이 비공식 엔드포인트를 쓴다. 인증 없음 · 마크업이 아니라 JSON 이라 비교적 안정적이지만
 *   바뀔 수 있다 — 의존은 이 파일 한 곳에만 둔다. 실측(2026-08-29): 90회 연속 호출에 제한 없음.
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type LiveDetail = {
  status?: string;
  liveTitle?: string | null;
  liveCategoryValue?: string | null;
  concurrentUserCount?: number | null;
  /** "yyyy-MM-dd HH:mm:ss" (KST) */
  openDate?: string | null;
  /** "…/image_{type}.jpg" — {type} 자리에 480 등 */
  liveImageUrl?: string | null;
};

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** 응답을 스냅샷 형태로. 방송 중이 아니면 live=false 만 의미 있다 */
export function normalizeLiveDetail(content: LiveDetail | null | undefined): CafeSnapshot {
  if (!content || content.status !== 'OPEN') {
    return { live: false, title: '', category: '', viewers: 0, openedAt: null, thumbnailUrl: null };
  }
  return {
    live: true,
    title: content.liveTitle ?? '',
    category: content.liveCategoryValue ?? '',
    viewers: content.concurrentUserCount ?? 0,
    openedAt: content.openDate ? kstToIso(content.openDate) : null,
    thumbnailUrl: content.liveImageUrl ? content.liveImageUrl.replace('{type}', '480') : null,
  };
}

/** "2026-08-29 20:30:00" (KST) → ISO */
export function kstToIso(kst: string): string | null {
  const m = kst.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
}

export async function fetchLiveSnapshot(channelId: string, fetchImpl: FetchLike = fetch): Promise<CafeSnapshot | null> {
  try {
    const response = await fetchImpl(`https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { content?: LiveDetail | null };
    return normalizeLiveDetail(body.content);
  } catch {
    return null;
  }
}

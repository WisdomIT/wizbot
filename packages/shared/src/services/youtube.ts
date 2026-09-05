import { Innertube } from 'youtubei.js';

import { ServiceError } from './errors';

/**
 * 유튜브 검색/조회 어댑터 (#5 #6).
 *
 * ⚠️ 비공식 API(youtubei.js)에 의존한다. 유튜브 변경으로 깨질 수 있으므로
 *    호출부는 반드시 이 모듈만 통해 접근한다(교체 지점을 한 곳으로).
 *
 * 실측(2026-08-21)으로 확인한 제약:
 * - `music.search` 는 이 환경에서 "No results" 만 반환한다 → 일반 검색 후 음악 채널 우선 정렬로 대체
 * - 서버에서 얻는 `playability_status` 는 모든 클라이언트에서 UNPLAYABLE 로 나온다(봇 탐지).
 *   따라서 재생 가능 여부는 **oEmbed 응답**으로 판정한다. 실제 재생 실패는 송출 소스가
 *   FAILED 로 보고해 자동 스킵한다(2단계).
 */

export interface YoutubeVideo {
  youtubeId: string;
  title: string;
  uploader: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
}

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
/** 한 번에 가져올 재생목록 곡 수 상한 — 너무 큰 목록으로 큐/즐겨찾기가 폭주하지 않게 */
export const PLAYLIST_MAX_ITEMS = 200;
const OEMBED_URL = 'https://www.youtube.com/oembed';

let clientPromise: Promise<Innertube> | null = null;

function getClient() {
  clientPromise ??= Innertube.create({
    lang: 'ko',
    location: 'KR',
    // 재생 스트림을 서버에서 다루지 않으므로 player 는 필요 없다 (초기화 비용 절감)
    retrieve_player: false,
  });
  return clientPromise;
}

export function isYoutubeId(value: string): boolean {
  return YOUTUBE_ID_PATTERN.test(value);
}

function thumbnailFor(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
}

/** 자동 생성 음악 채널(아티스트 - Topic)이면 음악 결과로 간주한다 */
function isMusicChannel(uploader: string): boolean {
  return uploader.trim().endsWith('- Topic');
}

/**
 * 검색 — 음악 카테고리를 우선한다.
 * 상위 결과 중 음악 채널이 있으면 그것을, 없으면 첫 결과를 쓴다.
 * sortBy 'popularity' 면 인기순 — 기본 즐겨찾기 폴백(#246)이 인기 곡을 고를 때 쓴다.
 */
export async function searchVideo(
  query: string,
  options: { sortBy?: 'relevance' | 'popularity' } = {},
): Promise<YoutubeVideo | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  let results;
  try {
    const yt = await getClient();
    results = await yt.search(trimmed, { type: 'video', prioritize: options.sortBy ?? 'relevance' });
  } catch (error) {
    throw new ServiceError(
      'INVALID_INPUT',
      '유튜브 검색에 실패했습니다. 잠시 후 다시 시도해주세요.',
    );
  }

  const videos = (results.videos ?? [])
    .map(toVideo)
    .filter((video): video is YoutubeVideo => video !== null);

  if (videos.length === 0) return null;

  // 상위 5개 안에서 음악 채널을 우선
  return videos.slice(0, 5).find((video) => isMusicChannel(video.uploader)) ?? videos[0];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toVideo(raw: any): YoutubeVideo | null {
  const youtubeId: string | undefined = raw?.video_id ?? raw?.id;
  if (!youtubeId || !isYoutubeId(youtubeId)) return null;

  const title: string = raw?.title?.text ?? raw?.title ?? '';
  const uploader: string = raw?.author?.name ?? '';
  const durationSeconds: number = raw?.duration?.seconds ?? 0;
  if (!title) return null;

  return {
    youtubeId,
    title: title.slice(0, 150),
    uploader: (uploader || '알 수 없음').slice(0, 150),
    durationSeconds,
    thumbnailUrl: thumbnailFor(youtubeId),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 재생목록 항목 파서.
 * 유튜브가 재생목록을 `LockupView` 노드로 내려주기 시작해(실측 2026-08-21) 검색 결과와 모양이 다르다.
 */
function fromLockup(raw: any): YoutubeVideo | null {
  if (raw?.type !== 'LockupView') return null;
  if (raw?.content_type && raw.content_type !== 'VIDEO') return null;

  const youtubeId: string = raw?.content_id ?? '';
  if (!isYoutubeId(youtubeId)) return null;

  const title: string = raw?.metadata?.title?.text ?? '';
  if (!title) return null;

  const uploader: string =
    raw?.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text ?? '';

  // 길이는 썸네일 위 뱃지("3:21" / "1:02:33")로만 내려온다
  const badge = (raw?.content_image?.overlays ?? []).find((overlay: any) =>
    Array.isArray(overlay?.badges),
  )?.badges?.[0]?.text;

  return {
    youtubeId,
    title: title.slice(0, 150),
    uploader: (uploader || '알 수 없음').slice(0, 150),
    durationSeconds: parseDurationBadge(badge),
    thumbnailUrl: thumbnailFor(youtubeId),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function parseDurationBadge(text: unknown): number {
  if (typeof text !== 'string') return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 0 || parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** 재생목록 주소(또는 ID)에서 재생목록 ID 를 뽑는다 */
export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (fromUrl) return fromUrl[1]!;
  // 접두사로 재생목록 ID 임이 분명한 경우만 받는다 (영상 ID 와 헷갈리지 않게)
  if (/^(PL|UU|OL|RD|LL|FL)[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * 재생목록의 곡 목록.
 * 곡마다 재생 가능 여부를 확인하면 수백 번 요청해야 하므로 여기서는 검사하지 않는다
 * (재생 실패는 송출 소스가 FAILED 로 보고해 자동으로 넘어간다).
 */
export interface PlaylistResult {
  title: string;
  videos: YoutubeVideo[];
  truncated: boolean;
}

/**
 * 재생목록 조회 결과 캐시.
 * 미리보기로 한 번, 실제로 담을 때 한 번 — 같은 목록을 연달아 두 번 읽게 되는데
 * 큰 목록은 커서를 여러 번 따라가야 해서 느리다. 짧게 재사용한다.
 */
const playlistCache = new Map<string, { at: number; result: PlaylistResult }>();
const PLAYLIST_CACHE_MS = 5 * 60 * 1000;

function cachePlaylist(playlistId: string, result: PlaylistResult): PlaylistResult {
  playlistCache.set(playlistId, { at: Date.now(), result });
  return result;
}

export async function getPlaylistVideos(input: string): Promise<PlaylistResult> {
  const playlistId = extractPlaylistId(input);
  if (!playlistId) {
    throw new ServiceError('INVALID_INPUT', '유튜브 재생목록 주소가 아닙니다.');
  }

  const cached = playlistCache.get(playlistId);
  if (cached && Date.now() - cached.at < PLAYLIST_CACHE_MS) {
    return cached.result;
  }

  let page;
  try {
    const yt = await getClient();
    page = await yt.getPlaylist(playlistId);
  } catch {
    throw new ServiceError(
      'NOT_FOUND',
      '재생목록을 불러오지 못했습니다. 공개(또는 링크 공개) 상태인지 확인해주세요.',
    );
  }

  const title: string = page.info?.title ?? '재생목록';
  const videos: YoutubeVideo[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (;;) {
    for (const node of page.videos ?? []) {
      const video = fromLockup(node) ?? toVideo(node);
      if (!video || seen.has(video.youtubeId)) continue;
      seen.add(video.youtubeId);
      videos.push(video);

      if (videos.length >= PLAYLIST_MAX_ITEMS) {
        return cachePlaylist(playlistId, { title, videos, truncated: true });
      }
    }

    if (!page.has_continuation) break;
    try {
      page = await page.getContinuation();
    } catch {
      // 다음 페이지를 못 읽으면 여기까지만 가져온다
      truncated = true;
      break;
    }
  }

  if (videos.length === 0) {
    throw new ServiceError('NOT_FOUND', '재생목록에 가져올 수 있는 영상이 없습니다.');
  }

  return cachePlaylist(playlistId, { title, videos, truncated });
}

/** 영상 ID 로 직접 조회 */
export async function getVideoById(youtubeId: string): Promise<YoutubeVideo | null> {
  if (!isYoutubeId(youtubeId)) return null;

  try {
    const yt = await getClient();
    const info = await yt.getBasicInfo(youtubeId);
    const basic = info.basic_info;
    if (!basic?.title) return null;

    return {
      youtubeId,
      title: basic.title.slice(0, 150),
      uploader: (basic.author ?? '알 수 없음').slice(0, 150),
      durationSeconds: basic.duration ?? 0,
      thumbnailUrl: thumbnailFor(youtubeId),
    };
  } catch {
    return null;
  }
}

export type PlayabilityResult =
  | { playable: true }
  | { playable: false; reason: '존재하지 않는 영상입니다.' | '외부 재생이 막혀 있는 영상입니다.' };

/**
 * 재생(임베드) 가능 여부 — oEmbed 응답으로 판정한다.
 * 200: 공개 + 임베드 허용 / 401: 임베드 차단·비공개 / 400·404: 없는 영상
 */
export async function checkPlayable(youtubeId: string): Promise<PlayabilityResult> {
  const url = `${OEMBED_URL}?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${youtubeId}`,
  )}&format=json`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    // 네트워크 문제로 확인 못 했을 때는 통과시킨다 — 실제 실패는 송출 소스가 보고한다
    return { playable: true };
  }

  if (response.ok) return { playable: true };
  if (response.status === 401) {
    return { playable: false, reason: '외부 재생이 막혀 있는 영상입니다.' };
  }
  return { playable: false, reason: '존재하지 않는 영상입니다.' };
}

/** 검색어 또는 영상 ID 로 곡 하나를 확정한다 (재생 가능 여부까지 확인) */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (isYoutubeId(trimmed)) return trimmed;

  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/,
  );
  return match ? match[1]! : null;
}

export async function resolveSong(input: string): Promise<YoutubeVideo> {
  const trimmed = input.trim();

  const youtubeId = extractVideoId(trimmed);
  const video = youtubeId ? await getVideoById(youtubeId) : await searchVideo(trimmed);
  if (!video) {
    throw new ServiceError('NOT_FOUND', '검색 결과가 없습니다.');
  }

  const playable = await checkPlayable(video.youtubeId);
  if (!playable.playable) {
    throw new ServiceError('INVALID_INPUT', playable.reason);
  }

  return video;
}

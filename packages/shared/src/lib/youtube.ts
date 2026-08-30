/**
 * 유튜브 채널 주소 → 채널 ID (#9). 스트리머는 `UC…` 를 모른다 — 채널 주소나 @핸들을 받아 페이지에서 찾는다.
 * 실측 (2026-09-01, 서버 fetch): `/@핸들`·`/c/이름`·`/user/이름`·`/channel/UC…` 모두
 *   `<link rel="canonical" href="https://www.youtube.com/channel/UC…">` 와 `<meta itemprop="identifier" content="UC…">` 를 준다.
 *   본문의 `"channelId":"UC…"` 는 추천 채널 것이 섞이므로 쓰지 않는다.
 */

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
/** @핸들 — 한글 등 비ASCII 도 되고(`@빅헤드`), 주소에서는 퍼센트 인코딩돼 온다 (실측: `/@%EB%B9%85%ED%97%A4%EB%93%9C` → 200) */
const HANDLE = /^@[^\s/?#@]{2,}$/;

function handleUrl(raw: string): string {
  let handle = raw;
  try { handle = decodeURIComponent(raw); } catch { /* 깨진 인코딩은 그대로 */ }
  return `https://www.youtube.com/@${encodeURIComponent(handle.slice(1))}`;
}

/** 입력 → 가져올 채널 페이지 URL. 채널 ID·@핸들·유튜브 주소를 받는다 */
export function youtubeChannelUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (CHANNEL_ID.test(value)) return `https://www.youtube.com/channel/${value}`;
  if (HANDLE.test(value)) return handleUrl(value);
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!/^(www\.|m\.)?youtube\.com$/i.test(url.hostname)) return null;
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (!first) return null;
  if (HANDLE.test(first)) return handleUrl(first);
  if ((first === 'channel' || first === 'c' || first === 'user') && second) return `https://www.youtube.com/${first}/${encodeURIComponent(second)}`;
  return null;
}

function decodeEntities(text: string): string {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** 채널 페이지 HTML 에서 채널 ID·이름 */
export function parseYoutubeChannelPage(html: string): { channelId: string; title: string | null } | null {
  const id =
    html.match(/<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
    html.match(/<meta\s+itemprop="identifier"\s+content="(UC[A-Za-z0-9_-]{22})"/)?.[1] ??
    null;
  if (!id) return null;
  const title = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/)?.[1];
  return { channelId: id, title: title ? decodeEntities(title) : null };
}

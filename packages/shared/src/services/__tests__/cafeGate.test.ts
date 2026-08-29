import { describe, expect, it } from 'vitest';

import { buildGatePlan, buildImageBlock, imageSizeOf, buildImageTag, buildYoutubeTag, cafeImageUrl, findImageTags, findYoutubeTags, imageSrcOf, normalizeGateHtml, replaceImageTags } from '../../lib/cafeGate';
import { parseYoutubeChannelPage, youtubeChannelUrl } from '../../lib/youtube';

describe('카페 대문 블록 (#9 PR3)', () => {
  it('표식 img 의 크기 속성 읽기 — 갱신 때 지정한 요소 크기를 이어받는다', () => {
    expect(imageSizeOf('<img id="x" src="a" width="640" height="360" alt="chzzk-automation" style="width:640px">')).toEqual({ width: 640, height: 360 });
    expect(imageSizeOf('<img src="a" alt="chzzk-automation">')).toBeNull();
  });
  it('이미지 URL — 사이트 끝 슬래시 제거, ?v= 일련번호', () => {
    expect(cafeImageUrl('https://bot.wisdomit.co.kr/', 'abc', 7)).toBe('https://bot.wisdomit.co.kr/cafe/abc.png?v=7');
  });
  it('img 태그는 width/height 명시 + alt 표식 (실측: 명시 안 하면 width=100 이 붙는다)', () => {
    expect(buildImageTag({ src: 'https://x/a.png?v=1', width: 836, height: 300 })).toBe('<img src="https://x/a.png?v=1" width="836" height="300" alt="chzzk-automation">');
    expect(buildImageBlock({ src: 'https://x/a.png?v=1', width: 836, height: 300, href: 'https://chzzk.naver.com/live/c' })).toBe(
      '<p><a href="https://chzzk.naver.com/live/c"><img src="https://x/a.png?v=1" width="836" height="300" alt="chzzk-automation"></a></p>',
    );
  });
  it('유튜브는 업로드 재생목록(UU…) nocookie embed', () => {
    expect(buildYoutubeTag('UCXuqSBlHAE6Xw-yeJA0Tunw', 560, 315)).toBe(
      '<iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=UUXuqSBlHAE6Xw-yeJA0Tunw" width="560" height="315" frameborder="0" allowfullscreen=""></iframe>',
    );
  });
  it('네이버가 손댄 형태(id·style 추가, 속성 순서 변경)에서도 표식 img 를 찾아 통째로 교체한다', () => {
    const naver = '<p><a href="https://chzzk.naver.com/live/c" target="_blank" rel="noopener noreferrer"><img id="https://x/a.png?v=2" src="https://x/a.png?v=2" width="836" height="300" alt="chzzk-automation" style="width:836px;height:300px;height:300px"></a></p>\n<p>아래</p>';
    expect(findImageTags(naver)).toHaveLength(1);
    expect(imageSrcOf(findImageTags(naver)[0])).toBe('https://x/a.png?v=2');
    const r = replaceImageTags(naver, buildImageTag({ src: 'https://x/a.png?v=3', width: 836, height: 200 }));
    expect(r.count).toBe(1);
    expect(r.html).toBe('<p><a href="https://chzzk.naver.com/live/c" target="_blank" rel="noopener noreferrer"><img src="https://x/a.png?v=3" width="836" height="200" alt="chzzk-automation"></a></p>\n<p>아래</p>');
  });
  it('표식 없는 img 는 건드리지 않는다', () => {
    expect(findImageTags('<img src="a.png" alt="other">')).toEqual([]);
    expect(replaceImageTags('<img src="a.png">', 'X').count).toBe(0);
  });
  it('공백 정규화 — 네이버 읽기 결과의 줄 끝 공백을 무시한다', () => {
    expect(normalizeGateHtml('<p>a</p> \n<p>b</p>\n')).toBe(normalizeGateHtml('<p>a</p><p>b</p>'.replace('><', '> <')));
  });
});

describe('반영 계획 buildGatePlan', () => {
  const image = { ready: true, src: 'https://x/a.png?v=1', href: 'https://chzzk.naver.com/live/c' };
  const pick = { path: [1, 0], w: 560, h: 315 };
  it('설정이 끝난 자리만 교체하고, 미완인 자리는 null (경로는 유지)', () => {
    const plan = buildGatePlan({ html: '', picks: { image: pick, youtube: pick }, image: { ...image, ready: false }, youtube: { channelId: 'UCXuqSBlHAE6Xw-yeJA0Tunw' } });
    expect(plan.image).toBeNull();
    expect(plan.youtube).toMatchObject({ kind: 'replace', path: [1, 0] });
    expect((plan.youtube as { html: string }).html).toContain('width="560" height="315"');
    //  이미지도 지정한 요소 크기 그대로
    const ready = buildGatePlan({ html: '', picks: { image: { path: [0], w: 640, h: 360 }, youtube: null }, image, youtube: { channelId: null } });
    expect((ready.image as { html: string }).html).toContain('width="640" height="360"');
  });
  it('remove 는 들어 있을 때만', () => {
    const html = '<p><img src="a" alt="chzzk-automation"></p>';
    expect(buildGatePlan({ html, picks: { image: 'remove', youtube: 'remove' }, image, youtube: { channelId: null } })).toEqual({ image: { kind: 'remove' }, youtube: null });
  });
  it('유튜브 iframe 찾기', () => {
    expect(findYoutubeTags('<iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=UUabc" width="560px"></iframe><iframe src="https://other"></iframe>')).toHaveLength(1);
  });
});

describe('유튜브 채널 주소 해석', () => {
  it.each([
    ['https://www.youtube.com/@LinusTechTips', 'https://www.youtube.com/@LinusTechTips'],
    ['youtube.com/@LinusTechTips/videos', 'https://www.youtube.com/@LinusTechTips'],
    ['@LinusTechTips', 'https://www.youtube.com/@LinusTechTips'],
    ['https://m.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw', 'https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw'],
    ['UCXuqSBlHAE6Xw-yeJA0Tunw', 'https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw'],
    ['https://www.youtube.com/c/LinusTechTips', 'https://www.youtube.com/c/LinusTechTips'],
    ['https://www.youtube.com/user/LinusTechTips', 'https://www.youtube.com/user/LinusTechTips'],
    ['https://www.youtube.com/@%EB%B9%85%ED%97%A4%EB%93%9C', 'https://www.youtube.com/@%EB%B9%85%ED%97%A4%EB%93%9C'],
    ['@빅헤드', 'https://www.youtube.com/@%EB%B9%85%ED%97%A4%EB%93%9C'],
    ['youtube.com/@빅헤드/featured', 'https://www.youtube.com/@%EB%B9%85%ED%97%A4%EB%93%9C'],
  ])('%s → %s', (input, url) => {
    expect(youtubeChannelUrl(input)).toBe(url);
  });
  it('유튜브가 아니거나 영상 주소면 null', () => {
    expect(youtubeChannelUrl('https://example.com/@x')).toBeNull();
    expect(youtubeChannelUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(youtubeChannelUrl('')).toBeNull();
  });
  it('채널 페이지에서 ID·이름 — 실측 형태 (2026-09-01)', () => {
    const html = '<link rel="canonical" href="https://www.youtube.com/channel/UCXuqSBlHAE6Xw-yeJA0Tunw"><meta property="og:title" content="Linus &amp; Tech Tips">"channelId":"UCt-oJR5teQIjOAxCmIQvcgA"';
    expect(parseYoutubeChannelPage(html)).toEqual({ channelId: 'UCXuqSBlHAE6Xw-yeJA0Tunw', title: 'Linus & Tech Tips' });
    expect(parseYoutubeChannelPage('<meta itemprop="identifier" content="UCXuqSBlHAE6Xw-yeJA0Tunw">')).toEqual({ channelId: 'UCXuqSBlHAE6Xw-yeJA0Tunw', title: null });
    expect(parseYoutubeChannelPage('"channelId":"UCt-oJR5teQIjOAxCmIQvcgA"')).toBeNull(); // 본문 JSON 은 안 믿는다
  });
});

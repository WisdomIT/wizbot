import { describe, expect, it } from 'vitest';

import { buildImageBlock, buildImageTag, buildYoutubeTag, cafeImageUrl, findImageTags, imageSrcOf, normalizeGateHtml, replaceImageTags } from '../../lib/cafeGate';

describe('카페 대문 블록 (#9 PR3)', () => {
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

import { describe, expect, it } from 'vitest';

import { encodePageUrl, extractInternalLinks, hashContent, htmlToText, normalizeUrl, parseSitemap } from '../wiki';

const BASE = 'https://bongnudo.super.site/';

describe('위키 수집 순수 함수 (#309)', () => {
  it('사이트맵 — 같은 호스트만, 디코드, api·_next 제외, 중복 제거', () => {
    const xml = `<urlset>
      <url><loc>https://bongnudo.super.site/</loc></url>
      <url><loc>https://bongnudo.super.site/api</loc></url>
      <url><loc>https://bongnudo.super.site/%eb%82%9a%ec%8b%9c</loc></url>
      <url><loc>https://bongnudo.super.site/낚시/</loc></url>
      <url><loc>https://other.site/x</loc></url>
    </urlset>`;
    expect(parseSitemap(xml, BASE)).toEqual(['https://bongnudo.super.site/', 'https://bongnudo.super.site/낚시']);
  });

  it('내부 링크 — 앵커·정적 자원·외부 제외, 인코딩 여부와 무관하게 하나로', () => {
    const html = `<a href="/"></a><a href="#block-1"></a><a href="/rp-%EA%B0%80%EC%9D%B4%EB%93%9C"></a><a href="/rp-가이드"></a>
      <link href="/styles/notion.css"><a href="/_next/static/x.js"></a><a href="https://assets.super.so/a.png"></a><a href="/낚시#block-2"></a>`;
    expect(extractInternalLinks(html, BASE)).toEqual(['https://bongnudo.super.site/', 'https://bongnudo.super.site/rp-가이드', 'https://bongnudo.super.site/낚시']);
    expect(normalizeUrl('mailto:x@y', 'https://bongnudo.super.site')).toBeNull();
  });

  it('요청 주소는 한글 슬러그를 인코딩한다', () => {
    expect(encodePageUrl('https://bongnudo.super.site/낚시')).toBe('https://bongnudo.super.site/%EB%82%9A%EC%8B%9C');
    expect(encodePageUrl('https://bongnudo.super.site/rp-정보/서버-참여')).toBe('https://bongnudo.super.site/rp-%EC%A0%95%EB%B3%B4/%EC%84%9C%EB%B2%84-%EC%B0%B8%EC%97%AC');
  });

  it('HTML → 텍스트 — main 안만, 제목 계층·목록·표를 살리고 목차·스크립트·태그는 버린다', () => {
    const html = `<html><head><title>낚시</title><style>.x{}</style></head><body>
      <header><a href="/">홈</a></header>
      <main class="super-content">
        <h1 class="notion-header">낚시</h1>
        <div class="notion-table-of-contents"><a>1. 개요</a><a>2. 준비</a></div>
        <h2 class="notion-heading">1. 개요</h2>
        <p class="notion-text">낚시는 &amp; 물고기를 &quot;낚는&quot; 콘텐츠입니다.</p>
        <ul><li class="notion-list-item">물가에서 낚싯대를 사용합니다.</li><li>찌가 물에 닿으면 기다립니다.</li></ul>
        <table><tr><th>등급</th><th>가격</th></tr><tr><td>기본</td><td>100</td></tr></table>
        <img src="x.png"><div class="notion-embed"></div>
        <script>alert(1)</script>
      </main>
      <footer>푸터</footer></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe('낚시');
    expect(text).toBe(['# 낚시', '## 1. 개요', '낚시는 & 물고기를 "낚는" 콘텐츠입니다.', '- 물가에서 낚싯대를 사용합니다.', '- 찌가 물에 닿으면 기다립니다.', '| 등급 | 가격 |', '| 기본 | 100 |'].join('\n'));
  });

  it('main 이 없으면 문서 전체에서, 해시는 내용에만 의존', () => {
    expect(htmlToText('<p>a</p><p>b</p>').text).toBe('a\nb');
    expect(hashContent('a\nb')).toBe(hashContent('a\nb'));
    expect(hashContent('a\nb')).not.toBe(hashContent('a\nc'));
  });
});

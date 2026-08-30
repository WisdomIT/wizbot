# 카페 대문 이미지 렌더용 폰트

`lib/cafe-fonts.ts` 가 `@napi-rs/canvas` 에 등록하는 파일들. 계정 설정 테마의 폰트 목록(`packages/shared/src/lib/theme.ts`)과 같은 13종.

- 출처: https://github.com/google/fonts (`ofl/` 아래), 전부 **SIL Open Font License** — `OFL.txt`
- 웹 화면은 Google Fonts CSS 를 런타임에 링크하지만, 서버 캔버스 렌더는 파일이 필요해서 여기에 둔다.
  빌드 시 네트워크 의존을 만들지 않으려고 원본 그대로 vendoring 한다 (#155 참고).
- 이모지·희귀 한글은 이미지에 apt 로 넣는 Noto Sans CJK / Noto Color Emoji 로 글자 단위 폴백한다.
- SUIT(기본 폰트)는 TTF 를 아직 넣지 않았다 — 캔버스에서는 Noto Sans CJK KR 로 그린다.

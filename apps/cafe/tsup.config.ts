import { defineConfig } from 'tsup';

//  카페 워커를 단일 CJS 번들로 (#31 과 같은 구성).
//  puppeteer 만 external — 브라우저 바이너리 경로·package.json 을 런타임에 읽으므로 번들하면 깨진다.
//  이미지의 prod-deps 가 puppeteer 를 설치하고, 브라우저는 시스템 chromium 을 쓴다 (Dockerfile).
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  external: ['puppeteer'],
});

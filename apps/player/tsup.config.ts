import { defineConfig } from 'tsup';

/**
 * 메인 프로세스를 파일 하나로 번들한다.
 * pnpm 의 심볼릭 링크 node_modules 를 electron-builder 가 그대로 담으면 깨지기 쉬우므로,
 * electron 만 외부로 두고 나머지는 전부 묶는다.
 */
export default defineConfig({
  entry: { main: 'src/main.ts' },
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  external: ['electron'],
  clean: true,
  minify: false,
  sourcemap: true,
});

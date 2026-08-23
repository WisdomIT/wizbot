import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      // SDK 클라이언트 생성자 검증 통과용 더미 (네트워크 호출 없음)
      CHZZK_ID: 'test-client-id',
      CHZZK_SECRET: 'test-client-secret',
    },
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
});

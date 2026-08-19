import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker 이미지용 — 실행에 필요한 파일만 .next/standalone 에 모은다 (#32)
  output: 'standalone',
  // 모노레포 루트를 트레이싱 기준으로 — @wizbot/shared 등 워크스페이스 의존성을 포함시키기 위함
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;

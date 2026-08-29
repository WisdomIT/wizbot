import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker 이미지용 — 실행에 필요한 파일만 .next/standalone 에 모은다 (#32)
  output: 'standalone',
  // 모노레포 루트를 트레이싱 기준으로 — @wizbot/shared 등 워크스페이스 의존성을 포함시키기 위함
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // 네이티브 바이너리 — 번들하지 않고 런타임에 require 한다. standalone 에 플랫폼 패키지가 함께 복사된다 (#9)
  serverExternalPackages: ['@napi-rs/canvas'],
  // 카페 이미지 렌더가 읽는 폰트 파일 — import 되지 않는 파일이라 트레이싱에 직접 넣는다
  outputFileTracingIncludes: { '/cafe/[channelId]': ['./fonts/**/*'] },
};

export default nextConfig;

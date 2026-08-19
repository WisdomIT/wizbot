# syntax=docker/dockerfile:1.7
#
# 위즈봇 모노레포 이미지 — 타깃별로 빌드한다:
#   docker build --target web     -t wizbot/web     .
#   docker build --target api     -t wizbot/api     .
#   docker build --target chatbot -t wizbot/chatbot .
#
# - web: Next.js standalone 산출물만 담은 슬림 이미지
# - api / chatbot: 현재 런타임이 ts-node 라 워크스페이스 소스 + 의존성을 그대로 담는다.
#   (#31 빌드 파이프라인 정리 후 tsup 번들 + --prod 의존성으로 슬림화 예정)
#
# 실행에 필요한 환경변수는 각 apps/*/.env.example 참고. 이미지에 .env 는 포함하지 않는다.

ARG NODE_VERSION=22
ARG PNPM_VERSION=10.5.2

# ── base: Node + pnpm + Prisma 엔진용 openssl ───────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# ── deps: 워크스페이스 전체 설치 + Prisma Client 생성 ──────────────────────
FROM base AS deps
# lockfile 과 각 패키지의 package.json 만 먼저 복사해 설치 레이어를 캐시한다
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/chatbot/package.json apps/chatbot/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/eslint-config/package.json packages/eslint-config/
# apps/cafe 는 소스를 싣지 않지만 lockfile 워크스페이스 검증을 위해 package.json 만 둔다.
# (puppeteer 의 브라우저 다운로드 등 postinstall 은 pnpm 10 기본 정책으로 실행되지 않는다)
COPY apps/cafe/package.json apps/cafe/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @wizbot/api exec prisma generate

# ── web-build: Next.js standalone 빌드 ─────────────────────────────────────
FROM deps AS web-build
# 빌드 시점에 모듈 초기화에서 참조하는 값들의 자리표시자 (런타임 env 가 실제 값을 덮어쓴다)
ENV JWT_SECRET=build-time-placeholder
RUN pnpm --filter @wizbot/web build

# ── web: 런타임 ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# standalone 은 outputFileTracingRoot(모노레포 루트) 기준 구조로 나온다: /app/apps/web/server.js
COPY --from=web-build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3001
CMD ["node", "apps/web/server.js"]

# ── api: tRPC 서버 (ts-node 런타임) ─────────────────────────────────────────
FROM deps AS api
ENV NODE_ENV=production \
    PORT=3002
EXPOSE 3002
WORKDIR /app/apps/api
CMD ["pnpm", "start"]

# ── chatbot: 치지직 챗봇 워커 (ts-node 런타임, stateful 싱글턴) ─────────────
FROM deps AS chatbot
ENV NODE_ENV=production
WORKDIR /app/apps/chatbot
CMD ["pnpm", "start"]

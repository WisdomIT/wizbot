# syntax=docker/dockerfile:1.7
#
# 위즈봇 모노레포 이미지 — 타깃별로 빌드한다:
#   docker build --target web     -t wizbot/web     .
#   docker build --target api     -t wizbot/api     .
#   docker build --target chatbot -t wizbot/chatbot .
#   docker build --target cafe    -t wizbot/cafe    .
#
# - web: Next.js standalone 산출물만 담은 슬림 이미지
# - api / chatbot / cafe: tsup 단일 파일 번들 (#31). 번들이 워크스페이스 소스와 npm 의존성을 모두
#   안고 있어서 런타임 node_modules 는 api 의 Prisma(클라이언트·엔진·CLI), cafe 의 puppeteer 만 담는다 —
#   packages/runtime-* 전용 패키지로 설치한다 (#134).
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
COPY apps/cafe/package.json apps/cafe/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/runtime-api/package.json packages/runtime-api/
COPY packages/runtime-cafe/package.json packages/runtime-cafe/
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
#  카페 대문 이미지 렌더(#9)의 폴백 폰트 — 한글 폰트에 없는 이모지·희귀 한글을 글자 단위로 대신 그린다
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# standalone 은 outputFileTracingRoot(모노레포 루트) 기준 구조로 나온다: /app/apps/web/server.js
COPY --from=web-build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
#  렌더용 폰트(OFL, vendoring) — standalone 트레이싱에도 넣었지만 명시적으로 복사한다
COPY --from=web-build --chown=nextjs:nodejs /app/apps/web/fonts ./apps/web/fonts
USER nextjs
EXPOSE 3001
CMD ["node", "apps/web/server.js"]

# ── bundle-build: api / chatbot 을 단일 파일로 번들 ─────────────────────────
FROM deps AS bundle-build
RUN pnpm --filter @wizbot/api --filter @wizbot/chatbot --filter @wizbot/cafe run build

# ── prod-deps-api / prod-deps-cafe: 런타임 의존성만 (#134) ──────────────────
#  번들이 npm 의존성을 전부 품고 있으므로 앱 패키지(`--filter @wizbot/api...`)를 설치하면 같은 패키지가
#  node_modules 에 한 번 더 들어간다(effect·youtubei.js·zod 등 ~80MB, cafe 는 Prisma 200MB 까지).
#  그래서 런타임에 정말 필요한 것만 담은 워크스페이스 패키지를 따로 둔다:
#    packages/runtime-api  : prisma + @prisma/client — compose 의 migrate 서비스가 이 이미지로
#                            `pnpm exec prisma migrate deploy` 를 돌리므로 CLI·엔진·생성 클라이언트가 필요
#    packages/runtime-cafe : puppeteer — cafe 번들의 유일한 external
#  lockfile 에 정식으로 들어 있어 --frozen-lockfile 이 유지된다. 설치 결과(node_modules)는 상대 심링크라
#  같은 깊이의 apps/<app>/node_modules 로 복사하면 그대로 동작한다.
FROM base AS prod-deps-api
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/runtime-api/package.json packages/runtime-api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @wizbot/runtime-api
#  설치 결과를 api 자리로 옮겨 놓고(상대 심링크라 같은 깊이면 그대로 동작) 그 안의 CLI 로 generate —
#  Prisma 는 스키마 위쪽의 package.json 을 프로젝트 루트로 삼으므로 apps/api/package.json 이 있어야 한다
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN cp -a packages/runtime-api/node_modules apps/api/node_modules \
 && cd apps/api && node_modules/.bin/prisma generate

FROM base AS prod-deps-cafe
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/runtime-cafe/package.json packages/runtime-cafe/
#  Chrome for Testing 은 받지 않는다 — cafe 이미지는 시스템 chromium 을 쓴다 (아래 cafe 스테이지)
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @wizbot/runtime-cafe

# ── api: tRPC 서버 ──────────────────────────────────────────────────────────
FROM base AS api
ENV NODE_ENV=production \
    PORT=3002
COPY --from=prod-deps-api /app/node_modules ./node_modules
COPY --from=prod-deps-api /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps-api /app/apps/api/prisma ./apps/api/prisma
#  package.json 은 `pnpm exec prisma` 가 패키지 루트를 찾는 데 쓴다 (compose 의 migrate 서비스)
COPY apps/api/package.json ./apps/api/
COPY package.json pnpm-workspace.yaml ./
COPY --from=bundle-build /app/apps/api/dist ./apps/api/dist
EXPOSE 3002
WORKDIR /app/apps/api
CMD ["node", "dist/server.js"]

# ── chatbot: 치지직 챗봇 워커 (stateful 싱글턴) ─────────────────────────────
#  워커는 Prisma 도 pnpm 도 쓰지 않는다(`node dist/index.js` 로 직접 실행) — base 를 거치지 않는다.
FROM node:${NODE_VERSION}-bookworm-slim AS chatbot
ENV NODE_ENV=production
WORKDIR /app
#  번들이 자족적이라 node_modules 가 아예 필요 없다.
COPY apps/chatbot/package.json ./apps/chatbot/
COPY --from=bundle-build /app/apps/chatbot/dist ./apps/chatbot/dist
EXPOSE 3003
WORKDIR /app/apps/chatbot
CMD ["node", "dist/index.js"]

# ── cafe: 네이버 카페 대문 워커 (#9, puppeteer · stateful 싱글턴) ───────────────
#  번들은 puppeteer 만 external 이라 node_modules 가 필요하고, 브라우저는 시스템 chromium 을 쓴다.
#  (puppeteer 가 받는 Chrome for Testing 은 데비안 slim 에서 라이브러리가 모자라고 용량도 크다)
FROM node:${NODE_VERSION}-bookworm-slim AS cafe
ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=prod-deps-cafe /app/node_modules ./node_modules
COPY --from=prod-deps-cafe /app/packages/runtime-cafe/node_modules ./apps/cafe/node_modules
COPY apps/cafe/package.json ./apps/cafe/
COPY --from=bundle-build /app/apps/cafe/dist ./apps/cafe/dist
EXPOSE 3004
WORKDIR /app/apps/cafe
CMD ["node", "dist/index.js"]

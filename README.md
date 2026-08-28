# 위즈봇 (WIZBOT)

[사이트 바로가기](https://bot.wisdomit.co.kr)

## 소개

치지직 챗봇 프로젝트 - 위즈봇의 모노레포입니다.  
본 서비스는 다음과 같은 기능을 제공합니다.

## 기능

### Echo

- 특정한 명령에 따라 대답하도록 할 수 있습니다.
- 예) `!카페` 입력 시 `https://cafe.naver.com/bighead033` 출력

### Function

- 특정한 명령에 따라 기능을 수행할 수 있습니다.
- 예) `!방제 수정 하이` 입력 시 현재 스트리밍 중인 방송 제목을 `하이`로 변경
- 방송 내용을 확인하여 표시하거나, 방송 관련 설정을 수정할 수 있으며 이후 설명하는 노래 기능과의 연동도 가능합니다.

### 노래신청

- 방송을 시청중인 시청자들이 유튜브에 업로드된 노래를 신청하고, 스트리머가 방송에서 재생할 수 있습니다.
- 예) `!노래신청 아이유 - 아이와 나의 바다` 입력 시 노래 신청 리스트에 [해당 유튜브 영상](https://www.youtube.com/watch?v=TqIAndOnd74)이 올라감.
- 자주 재생하는 노래 리스트를 재생목록으로 저장해두고 불러오거나 신청 리스트에 없을 경우 랜덤 재생하도록 할 수 있습니다.
- 시청자는 홈페이지에서 현재 재생중인 곡과 리스트를 확인할 수 있습니다.
- 스트리머가 원할 경우 해당 기능을 끌 수 있습니다.

### 카페 대문 자동화

- 기존에 제작된 [WisdomIT/naver-cafe-gate-automation](https://github.com/WisdomIT/naver-cafe-gate-automation)을 본 프로젝트에 포함하였습니다.
- 유튜브 및 치지직 상태 변경 시 카페 대문을 자동으로 업데이트하는 기능입니다.
- 현재 다음과 같은 카페에서 사용되고 있습니다.
  - [빅헤드 대가리숲](https://cafe.naver.com/bighead033)
  - [뫄사카](https://cafe.naver.com/mamwa)

## Environments

- Node.js >= 18.18
- MySQL >= 8
- pnpm@10.5.2

## Tech Stack

- Next.js 15 + App Router
- Tailwind CSS + shadcn/ui
- tRPC
- Prisma + MySQL
- socket.io

## Structure

본 모노레포는 다음과 같은 구조를 가지고 있습니다.

| 경로                   | 패키지명              | 설명                                      |
| ---------------------- | --------------------- | ----------------------------------------- |
| apps/api               | @wizbot/api           | 백엔드 API 서버, tRPC 기반의 DB 접근 처리 |
| apps/chatbot           | @wizbot/chatbot       | 실시간 소켓 통신 기반 챗봇 클라이언트     |
| apps/cafe              | @wizbot/cafe          | 카페 대문 자동화                          |
| apps/web               | @wizbot/web           | 챗봇 홈페이지                             |
| packages/eslint-config | @wizbot/eslint-config | ESLint 설정 모듈                          |
| packages/shared        | @wizbot/shared        | 공통 타입, 유틸, tRPC 라우터              |

## Getting Started

1. 각 앱의 `.env.example`을 복사해 `.env`를 작성합니다.

```bash
cp apps/api/.env.example apps/api/.env         # DATABASE_URL, CHZZK_*, PUBLIC_SITE_URL, SMTP_*, JWT_SECRET, INTERNAL_API_TOKEN
cp apps/web/.env.example apps/web/.env         # JWT_SECRET, API_URL
cp apps/chatbot/.env.example apps/chatbot/.env # API_URL, INTERNAL_API_TOKEN
```

- `JWT_SECRET`은 web(세션 발급)과 api(세션 검증)에 **같은 값**을, `INTERNAL_API_TOKEN`은 api와 chatbot에 **같은 값**을 넣어야 합니다.
- API 인증 구조: 웹 사용자 요청은 `session-token`(JWT)을 `Authorization: Bearer`로 전달 → `streamerProcedure`, 챗봇 워커는 `x-internal-token` 헤더 → `internalProcedure`. 공개 조회는 `publicProcedure`.

2. 의존성 설치 후 DB 스키마를 적용하고 실행합니다.

```bash
pnpm install
pnpm prisma:generate      # Prisma Client 생성
pnpm prisma:migrate       # 개발 DB에 마이그레이션 적용 (prisma migrate dev)
pnpm dev
```

### 데이터베이스 마이그레이션

스키마 변경 이력은 `apps/api/prisma/migrations`로 관리합니다. `prisma db push`는 사용하지 않습니다.

| 상황 | 명령 |
| --- | --- |
| 스키마 변경 후 마이그레이션 생성 (개발) | `pnpm prisma:migrate` |
| 운영 DB에 적용 (배포 시) | `pnpm prisma:deploy` |
| 기존 운영 DB에 최초 도입 (baseline) | `pnpm --filter @wizbot/api exec prisma migrate resolve --applied 0_init` 후 `pnpm prisma:deploy` |

`0_init`은 2026-08 기준 스키마 전체를 담은 baseline 마이그레이션입니다. 이미 `db push`로 만들어진 운영 DB에는 위 `migrate resolve --applied 0_init`으로 "적용됨" 표시만 해주면 됩니다.

## Docker

루트 `Dockerfile` 하나에 타깃 3개(`web` / `api` / `chatbot`)가 있습니다.

```bash
docker build --target web     -t wizbot/web     .
docker build --target api     -t wizbot/api     .
docker build --target chatbot -t wizbot/chatbot .
```

로컬에서 전체 스택(MySQL 포함)을 올려 보려면:

```bash
cp .env.docker.example .env.docker && $EDITOR .env.docker
docker compose --env-file .env.docker up -d --build
# http://localhost:3001
```

- `dev` 브랜치에 머지되면 CI가 `ghcr.io/wisdomit/wizbot/{web,api,chatbot}:dev` 이미지를 올리고 개발 스택(botdev)을 자동 재배포합니다.
- 정식 릴리즈는 `main`에 `vX.Y.Z` 태그를 푸시하면 `release.yml`이 버전 태그 이미지와 플레이어 앱을 올리고 운영 스택을 재배포합니다.
- 브랜치 전략·커밋 규칙·릴리즈 절차는 [CONTRIBUTING.md](CONTRIBUTING.md) 를 참고하세요.
- 운영 배포(Portainer 스택)는 [homelab-wisdomserver](https://github.com/WisdomIT/homelab-wisdomserver)의 `optional/wizbot`을 사용합니다.
- `chatbot`은 채널별 소켓/타이머를 메모리에 갖는 stateful 싱글턴이므로 replica를 늘리면 안 됩니다. `web`/`api`는 stateless라 늘려도 됩니다.

## Copyright

© [WisdomIT](https://discord.com/users/901304044767834123)

위즈봇은 치지직의 써드파티 사이트로, 치지직에서 운영하는 사이트가 아닙니다.  
“치지직”은 NAVER Corp.의 등록 상표입니다.

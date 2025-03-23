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
- 예) `!방제수정 하이` 입력 시 현재 스트리밍 중인 방송 제목을 `하이`로 변경
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

```bash
pnpm -w install
cd apps/api
pnpm prisma db push #or pnpm prisma generate
pnpm -w dev
```

## Copyright

© [WisdomIT](https://discord.com/users/901304044767834123)

위즈봇은 치지직의 써드파티 사이트로, 치지직에서 운영하는 사이트가 아닙니다.  
“치지직”은 NAVER Corp.의 등록 상표입니다.

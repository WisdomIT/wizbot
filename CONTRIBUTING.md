# 기여 안내

위즈봇의 브랜치 전략과 릴리즈 절차입니다. 규칙 대부분은 GitHub 룰셋으로 강제되어 있어
어기면 push 나 머지가 거부됩니다 — 이 문서는 **왜 그렇게 되어 있는지**를 설명합니다.

## 브랜치

```
feat/*  fix/*  chore/*  refactor/*  ──PR──▶  dev  ──PR + 태그──▶  main
                                              │                    │
                                       botdev.wisdomit.co.kr   bot.wisdomit.co.kr
                                       (:dev 이미지, 자동)       (vX.Y.Z 이미지)
```

| 브랜치 | 역할 | 배포 |
|---|---|---|
| `dev` | 기본 브랜치. 모든 작업 PR 의 대상 | 머지마다 `:dev` 이미지 빌드 → **botdev** 자동 재배포 |
| `main` | 릴리즈 전용. `dev` 에서만 머지된다 | `vX.Y.Z` 태그 푸시 → 버전 이미지 빌드 → **bot** 자동 재배포 |
| `feat/*` 등 | 작업 브랜치. `dev` 에서 파고 `dev` 로 돌아간다 | — |

작업 브랜치 이름은 `<종류>/<이슈번호>-<요약>` 을 권장합니다 (`feat/117-download-page`).
이슈 번호가 앞에 있으면 브랜치 목록만 봐도 무슨 일인지 알 수 있습니다.

### 룰셋으로 강제되는 것

`dev` 와 `main` 모두:

- **직접 push 금지** — PR 로만 들어간다
- **CI `typecheck · lint · build` 통과 필수** — 실패한 PR 은 머지 버튼이 잠긴다
- 브랜치 삭제·force push 금지
- 승인 리뷰는 요구하지 않는다 (1인 프로젝트)

머지되면 작업 브랜치는 자동으로 삭제됩니다.

### 작업 시작 전에

```bash
git switch dev && git pull
git switch -c feat/<이슈번호>-<요약>
```

**편집을 시작하기 전에** 반드시 `dev` 를 당기고 새 브랜치를 팝니다. 이 프로젝트는 웹 변경을
확인하려면 머지 → 재배포가 필요해서 PR 이 올라오면 곧바로 머지되는 편입니다. 그래서 "PR 올림 →
피드백 → 추가 수정" 흐름에서 **직전 브랜치는 거의 항상 이미 머지된 상태**입니다. 거기에 커밋하면
`pull_request` 이벤트가 없어 CI 가 돌지 않고, 변경이 `dev` 에 없는데 반영된 줄 알고 테스트하게
됩니다.

## 커밋 메시지

```
<이모지> <type>: <요약> (#이슈)

<본문 — 왜 바꿨는지, 무엇을 확인했는지>
```

| 이모지 · type | 쓰임 |
|---|---|
| ✨ `feat` | 기능 추가 |
| 🐛 `fix` | 버그 수정 |
| ♻️ `refactor` | 동작 변화 없는 구조 변경 |
| 👷 `build` / `ci` | 빌드·CI·배포 파이프라인 |
| 📝 `docs` | 문서 |
| 🚀 `release` | `dev` → `main` 릴리즈 머지 |

본문에는 **결과보다 이유**를 적습니다. 무엇을 바꿨는지는 diff 가 말해주지만, 왜 그 방법을 골랐는지·
무엇을 시도했다 버렸는지·어떻게 검증했는지는 커밋 메시지에만 남습니다.

### PR 설명

커밋 본문과 같은 원칙입니다. 리뷰어(미래의 자신 포함)가 알아야 할 것:

- 왜 필요한가 — 어떤 문제가 있었나
- 어떻게 확인했나 — 실제로 돌려본 것, 돌려보지 못한 것
- 판단이 필요했던 지점 — 다른 선택지가 있었다면 왜 이쪽인지

`Closes #N` 은 이슈마다 따로 씁니다. `Closes #1 #2` 는 **첫 번째만** 닫힙니다.

## 검증

호스트에 Node 가 없어도 됩니다 — 컨테이너로 돌립니다.

```bash
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/app" -w /app \
  -e HOME=/tmp -e CI=true -e ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
  -e DATABASE_URL='mysql://ci:ci@localhost:3306/ci' -e JWT_SECRET=ci-only-secret \
  node:22-bookworm-slim bash -c '
    export PATH=/tmp/npm/bin:$PATH
    npm i -g --prefix /tmp/npm pnpm@10.5.2 >/dev/null 2>&1
    pnpm install --frozen-lockfile
    pnpm --filter @wizbot/api exec prisma generate
    pnpm -r --if-present run typecheck && pnpm -r --if-present run lint && pnpm test
  '
```

CI 의 `check` 잡이 하는 것과 같습니다. 여기에 더해:

- **api / chatbot 을 건드렸으면** 번들이 실제로 뜨는지 본다 — `pnpm --filter @wizbot/api build` 뒤 `node dist/server.js`.
  타입체크는 통과하는데 런타임에서 죽는 경우가 있다 (전이 의존성 버전 충돌 등).
- **스키마를 바꿨으면** 빈 MySQL 에 `prisma migrate deploy` 를 태워 본다. 마이그레이션은
  **디렉터리 이름 순**으로 적용되고, 이미 적용된 것의 체크섬은 검사하지 않는다.
- **플레이어 앱을 건드렸으면** `player package check` 워크플로를 수동 실행한다. Linux 에서는
  dmg/exe 를 만들 수 없다.

### 테스트 작성

새로 만든 **순수 로직**(서비스 계층 함수·파서·정책 계산 — 한도 규칙, 마스킹, 상태 전이 같은 것)은
같은 PR 에 vitest 단위 테스트를 함께 넣는다. 회귀 확인(위의 `pnpm test`)만으로는 새 로직이
검증되지 않는다.

외부 API 어댑터·화면처럼 모킹 비용 대비 효익이 낮은 부분은 생략할 수 있다 — 대신 PR 본문의
「확인 방법」에 실측 절차를 적고 botdev 에서 확인한다.

## 릴리즈

```bash
# 1. dev → main PR 을 만들고 CI 통과 후 머지한다 (제목: 🚀 release: vX.Y.Z — 요약)
gh pr create --base main --head dev --title "🚀 release: v1.2.0 — ..."
gh pr merge <번호> --merge

# 2. main 의 머지 커밋에 태그를 붙인다
git fetch origin main
git tag -a v1.2.0 origin/main -m "v1.2.0 — 요약"
git push origin v1.2.0
```

태그를 푸시하면 `release.yml` 이 순서대로 돕니다.

```
verify(태그가 main 에 있는지) → build(web·api·chatbot 이미지) → release(GitHub Release)
                                                              → app(플레이어 dmg×2·exe 첨부)
                                                              → deploy(운영 Portainer 재배포)
```

### 알아둘 것

- **이미지 태그에는 `v` 가 없다.** git 태그 `v1.2.0` → 이미지 `1.2.0`. Portainer 의 `IMAGE_TAG` 에
  `v1.2.0` 을 넣으면 pull 이 not found 로 실패한다.
- **운영 전환은 수동이다.** 자동 재배포는 스택을 다시 올릴 뿐, `IMAGE_TAG` 는 고정돼 있다.
  릴리즈 후 Portainer 에서 `IMAGE_TAG` 를 새 버전으로 바꾸고 재배포해야 실제로 넘어간다.
- **프리릴리즈**는 태그에 `-` 를 넣는다 (`v1.2.0-alpha.1`). `latest` 이미지를 덮지 않고 운영
  재배포도 건너뛴다. 플레이어 앱은 빌드되지만 `electron-updater` 가 일반 사용자에게 내려보내지
  않는다. 배포 경로 자체를 시험할 때 쓴다.
- **`releases/latest` 는 프리릴리즈를 건너뛴다.** 다운로드 페이지는 마지막 정식 릴리즈를 가리킨다.
- **릴리즈 노트 = 릴리즈 PR 본문 + 자동 생성 목록.** `release.yml` 이 태그가 가리키는 머지 커밋의 PR(dev → main)
  본문을 노트 상단에 싣고, 그 아래에 머지된 PR 목록을 붙인다. 그러니 릴리즈 PR 본문은 **사용자에게 무엇이
  달라졌는지** 기준으로 쓴다 (내부 구조 변경은 목록이 말해준다).
- 스키마 변경이 있으면 `migrate` 서비스가 기동 시 적용한다. 파괴적 변경 전에는 DB 백업을 확인한다.

## 의존성 업데이트

dependabot 이 매주 PR 을 올립니다. **CI 초록만 보고 머지하지 않습니다.**

- 패치·마이너 — CI 통과면 머지
- **메이저** — 런타임 동작이 바뀔 수 있다. 타입체크는 라우팅 문법이나 getter 변경 같은 것을 잡지
  못한다. 실제로 돌려서 핵심 경로(tRPC·SSE·챗봇 폴링)를 확인한 뒤 머지한다
- 실패하는 PR 은 **우리 설정이 원인일 수 있다.** `@types/node` 26 이 막힌 이유는 우리 `target` 이
  ES2020 이어서였다. dependabot 을 탓하기 전에 에러를 읽는다
- 코드 마이그레이션이 필요한 것(react-table v9 등)은 이슈로 떼고 PR 은 열어둔다

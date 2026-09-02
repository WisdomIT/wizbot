# 에이전트 작업 지침

이 저장소에서 코딩 에이전트(Claude Code 등)가 작업할 때 지키는 규칙. 사람 기여자 규칙은
[CONTRIBUTING.md](CONTRIBUTING.md) 가 기준이고, 여기는 에이전트가 자주 어기는 것만 요약한다.

## 브랜치·PR

- 기본 브랜치는 **`dev`**. 작업은 항상 `git checkout dev && git pull` 후 새 브랜치에서 시작한다.
- **커밋 전에 현재 브랜치의 PR 상태를 확인한다.** 사용자의 피드백이 왔다는 것은 그 PR 이 이미
  머지됐다는 뜻이다(사용자는 botdev 에서 확인하려면 머지해야 한다) — 머지/닫힌 브랜치에 커밋을
  얹지 말고 dev 에서 새 브랜치를 딴다.
- **PR 은 한 번에 한 건.** PR 을 올리면 멈추고, 사용자가 머지·확인한 뒤 다음 작업을 진행한다.

## 검증 (모든 PR 전에)

[CONTRIBUTING.md 의 「검증」](CONTRIBUTING.md#검증) 을 그대로 따른다 — 호스트에 Node 가 없으므로
컨테이너로 typecheck · lint · `pnpm test` 를 돌리고, api/chatbot 변경 시 번들 빌드,
스키마 변경 시 빈 MySQL 에 `migrate deploy` + `migrate diff`(drift 없음 확인),
web 변경 시 더미 env 로 프로덕션 빌드까지 확인한다.

**새 순수 로직에는 같은 PR 에 vitest 단위 테스트를 함께 넣는다**
(CONTRIBUTING 「테스트 작성」). 실측으로만 확인 가능한 부분은 PR 본문 「확인 방법」에 절차를 적는다.

## 관례

- 릴리즈 PR(dev→main) 본문이 곧 GitHub 릴리즈 노트다 — 사용자 관점 요약으로 쓴다
  (CONTRIBUTING 「릴리즈」).
- UI 문구는 간결하게 — 괄호 부연·구어체 라벨 지양 (예: 「새 버전 (1.2.3) 설치」).
- 설정 도우미 에이전트(#35)는 [wisdomit/pelican-concierge](https://github.com/wisdomit/pelican-concierge)
  의 wizbot 이식이다 — 화면·플로우를 만들기 전에 원본의 해당 구현을 먼저 읽고 따른다.
  임의 단순화 금지, 다르게 갈 때는 이유를 명시한다.

#!/usr/bin/env bash
# Portainer 스택의 IMAGE_TAG 를 바꾸고 재배포한다 (#261, #340).
#
# 웹훅은 「현재 설정 그대로 재배포」만 해서 릴리즈마다 IMAGE_TAG 를 손으로 바꿔야 했다 (#261).
#
# 운영 스택은 homelab-wisdomserver 리포에 연결된 git 스택이다. git 스택의 Env 갱신은 반드시
# `PUT /api/stacks/{id}/git/redeploy` 로 한다 — git 에서 다시 받아 배포하면서 본문 env 로 Env 를 교체한다.
# ⚠ 파일 기반 갱신 `PUT /api/stacks/{id}`(compose 내용 + env) 를 git 스택에 호출하면 Portainer 가
#   GitConfig 를 지워 스택이 파일 기반으로 바뀐다(자동 갱신 중단, homelab compose 변경이 영영 반영 안 됨).
#   v1.5.0 릴리즈가 그렇게 운영 스택을 끊었다 (#340). GitConfig 가 없는 스택에만 파일 PUT 으로 떨어진다.
#
# 입력(env):
#   PORTAINER_URL          기본 https://portainer.wisdomit.co.kr
#   PORTAINER_API_KEY      X-API-Key
#   PORTAINER_STACK_ID     스택 id (스택 URL 의 ?id=)
#   PORTAINER_ENDPOINT_ID  환경 id (스택 URL 의 #!/<id>/)
#   IMAGE_TAG              바꿀 값 (v 없는 버전, 예 1.4.6)
#   DRY_RUN                1 이면 조회·계획만 출력하고 PUT 하지 않는다
#
# ⚠ self-hosted 러너에서 돈다 — GitHub 호스티드 러너는 Cloudflare Bot Fight Mode 에 걸린다 (#124)
set -euo pipefail

: "${PORTAINER_API_KEY:?PORTAINER_API_KEY 가 없습니다}"
: "${PORTAINER_STACK_ID:?PORTAINER_STACK_ID 가 없습니다}"
: "${PORTAINER_ENDPOINT_ID:?PORTAINER_ENDPOINT_ID 가 없습니다}"
: "${IMAGE_TAG:?IMAGE_TAG 가 없습니다}"
PORTAINER_URL="${PORTAINER_URL:-https://portainer.wisdomit.co.kr}"
DRY_RUN="${DRY_RUN:-0}"

api() {
  # $1 method, $2 path, $3 body(optional). 응답 본문은 stdout, 상태는 마지막 줄
  local method=$1 path=$2 body=${3:-}
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$PORTAINER_URL$path" -H "X-API-Key: $PORTAINER_API_KEY" -H 'Content-Type: application/json' --data-binary "$body" --max-time 600 -w '\n%{http_code}'
  else
    curl -sS -X "$method" "$PORTAINER_URL$path" -H "X-API-Key: $PORTAINER_API_KEY" --max-time 60 -w '\n%{http_code}'
  fi
}

check() {
  # $1 응답(본문+상태), $2 설명. 2xx 가 아니면 본문을 보이고 실패
  local response=$1 what=$2 code body
  code=$(printf '%s' "$response" | tail -n1)
  body=$(printf '%s' "$response" | sed '$d')
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "::error::$what 실패 — HTTP $code"
    printf '%s\n' "$body" | head -c 2000
    exit 1
  fi
  printf '%s' "$body"
}

field() {
  # $1 JSON, $2 키 — 최상위 키 값을 문자열로
  printf '%s' "$1" | python3 -c 'import json,sys; v=json.load(sys.stdin)[sys.argv[1]]; print(v if isinstance(v,str) else json.dumps(v, ensure_ascii=False))' "$2"
}

stack=$(check "$(api GET "/api/stacks/$PORTAINER_STACK_ID")" "스택 조회")

# 스택 정보 + Env 에서 IMAGE_TAG 만 바꾼 env 배열. 나머지 env 는 그대로.
# git 스택이면 git/redeploy 본문을, 아니면 파일 PUT 용 env 만 만든다(compose 는 아래서 따로 읽는다).
plan=$(python3 - "$IMAGE_TAG" "$stack" <<'PY'
import json, sys
tag, stack = sys.argv[1], json.loads(sys.argv[2])
env = stack.get("Env") or []
names = [e["name"] for e in env]
before = next((e["value"] for e in env if e["name"] == "IMAGE_TAG"), None)
if "IMAGE_TAG" in names:
    env = [{"name": e["name"], "value": tag if e["name"] == "IMAGE_TAG" else e["value"]} for e in env]
else:
    env = [{"name": e["name"], "value": e["value"]} for e in env] + [{"name": "IMAGE_TAG", "value": tag}]

git = stack.get("GitConfig") or None
auth = (git or {}).get("Authentication") or None
plan = {
    "stack": stack.get("Name"), "endpoint": stack.get("EndpointId"),
    "before": before, "after": tag, "envNames": names,
    "git": {
        "url": git["URL"], "ref": git.get("ReferenceName") or "", "path": git.get("ConfigFilePath") or "",
        "auth": bool(auth), "username": (auth or {}).get("Username") or "",
    } if git else None,
}
body = {"env": env, "prune": False, "pullImage": True}
if git:
    # repositoryPassword 를 비우면 스택에 저장된 자격증명을 그대로 쓴다 (stack_update_git_redeploy.go)
    body.update({
        "repositoryReferenceName": plan["git"]["ref"],
        "repositoryAuthentication": plan["git"]["auth"],
        "repositoryUsername": plan["git"]["username"],
        "repositoryPassword": "",
    })
    cred = (auth or {}).get("GitCredentialID") or 0
    if cred:
        body["repositoryGitCredentialID"] = cred
print(json.dumps({"plan": plan, "body": body}, ensure_ascii=False))
PY
)
meta=$(field "$plan" plan)
body=$(field "$plan" body)
git=$(field "$meta" git)
before=$(field "$meta" before)

echo "스택: $meta"
if [ "$(field "$meta" endpoint)" != "$PORTAINER_ENDPOINT_ID" ]; then
  echo "::error::PORTAINER_ENDPOINT_ID($PORTAINER_ENDPOINT_ID) 가 스택의 EndpointId($(field "$meta" endpoint)) 와 다릅니다"
  exit 1
fi

if [ "$git" != "null" ]; then
  echo "git 연결됨: $(field "$git" url) @ $(field "$git" ref) ($(field "$git" path)) — git/redeploy 로 갱신합니다."
  if [ "$DRY_RUN" = "1" ]; then
    echo "DRY_RUN — 호출하지 않습니다. 실제 릴리즈라면 IMAGE_TAG $before → $IMAGE_TAG 로 바꾸고 git 에서 다시 받아 재배포합니다."
    exit 0
  fi
  echo "IMAGE_TAG $before → $IMAGE_TAG"
  check "$(api PUT "/api/stacks/$PORTAINER_STACK_ID/git/redeploy?endpointId=$PORTAINER_ENDPOINT_ID" "$body")" "스택 git 재배포" >/dev/null
  echo "Portainer 스택 갱신 완료 — IMAGE_TAG=$IMAGE_TAG 로 git 에서 다시 받아 재배포했습니다."
  exit 0
fi

# ── git 미연결(파일 기반) 스택 — 예전 방식. compose 내용을 그대로 다시 PUT 한다 ──
echo "::warning::스택 '$(field "$meta" stack)' 이 git 에 연결돼 있지 않습니다(파일 기반). homelab-wisdomserver 의 compose 변경이 운영에 반영되지 않습니다 — Portainer 에서 Repository 스택으로 다시 만들어야 합니다 (#340)."
file=$(check "$(api GET "/api/stacks/$PORTAINER_STACK_ID/file")" "스택 파일 조회")
body=$(python3 -c 'import json,sys; b=json.loads(sys.argv[1]); b["stackFileContent"]=json.loads(sys.argv[2])["StackFileContent"]; print(json.dumps(b))' "$body" "$file")
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN — PUT 하지 않습니다. 실제 릴리즈라면 IMAGE_TAG $before → $IMAGE_TAG 로 바꾸고 현재 compose 그대로 재배포합니다."
  exit 0
fi
echo "IMAGE_TAG $before → $IMAGE_TAG"
check "$(api PUT "/api/stacks/$PORTAINER_STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID" "$body")" "스택 갱신·재배포" >/dev/null
echo "Portainer 스택 갱신 완료 — IMAGE_TAG=$IMAGE_TAG 로 재배포했습니다 (파일 기반)."

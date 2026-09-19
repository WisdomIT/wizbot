#!/usr/bin/env bash
# Portainer 스택의 IMAGE_TAG 를 바꾸고 재배포한다 (#261).
#
# 웹훅은 「현재 설정 그대로 재배포」만 해서 릴리즈마다 IMAGE_TAG 를 손으로 바꿔야 했다.
# API 로는 스택 파일(그대로) + Env(IMAGE_TAG 만 교체) 를 PUT 해 env 갱신과 재배포가 한 번에 된다.
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

stack=$(check "$(api GET "/api/stacks/$PORTAINER_STACK_ID")" "스택 조회")
file=$(check "$(api GET "/api/stacks/$PORTAINER_STACK_ID/file")" "스택 파일 조회")

# Env 에서 IMAGE_TAG 만 바꾼 PUT 본문을 만든다. 나머지 env·compose 내용은 그대로
payload=$(python3 - "$IMAGE_TAG" <<'PY' "$stack" "$file"
import json, sys
tag, stack, file = sys.argv[1], json.loads(sys.argv[2]), json.loads(sys.argv[3])
env = stack.get("Env") or []
names = [e["name"] for e in env]
before = next((e["value"] for e in env if e["name"] == "IMAGE_TAG"), None)
if "IMAGE_TAG" in names:
    env = [{"name": e["name"], "value": tag if e["name"] == "IMAGE_TAG" else e["value"]} for e in env]
else:
    env = [{"name": e["name"], "value": e["value"]} for e in env] + [{"name": "IMAGE_TAG", "value": tag}]
print(json.dumps({
    "meta": {"stack": stack.get("Name"), "endpoint": stack.get("EndpointId"), "before": before, "after": tag, "envNames": names},
    "body": {"stackFileContent": file["StackFileContent"], "env": env, "prune": False, "pullImage": True},
}))
PY
)
meta=$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["meta"], ensure_ascii=False))')
body=$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["body"]))')

echo "스택: $meta"
endpoint_in_stack=$(printf '%s' "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["endpoint"])')
if [ "$endpoint_in_stack" != "$PORTAINER_ENDPOINT_ID" ]; then
  echo "::error::PORTAINER_ENDPOINT_ID($PORTAINER_ENDPOINT_ID) 가 스택의 EndpointId($endpoint_in_stack) 와 다릅니다"
  exit 1
fi

before=$(printf '%s' "$meta" | python3 -c 'import json,sys; print(json.load(sys.stdin)["before"])')
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN — PUT 하지 않습니다. 실제 릴리즈라면 IMAGE_TAG $before → $IMAGE_TAG 로 바꾸고 재배포합니다."
  exit 0
fi
echo "IMAGE_TAG $before → $IMAGE_TAG"


check "$(api PUT "/api/stacks/$PORTAINER_STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID" "$body")" "스택 갱신·재배포" >/dev/null
echo "Portainer 스택 갱신 완료 — IMAGE_TAG=$IMAGE_TAG 로 재배포했습니다."

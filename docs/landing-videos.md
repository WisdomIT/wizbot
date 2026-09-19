# 랜딩 쇼케이스 영상 — 녹화·압축·배치 가이드 (#277)

랜딩의 「위즈봇에만 있는 것」 섹션은 좌측 항목 6개와 우측 자동 재생 영상으로 구성된다.
영상은 운영자가 실제 화면을 녹화해 넣는다. 파일이 없으면 아이콘 플레이스홀더가 대신 나오고 8초 뒤 다음 항목으로 넘어가므로,
녹화 전에도 랜딩은 깨지지 않는다.

## 파일 위치와 이름

```
apps/web/public/videos/landing/
  agent.v1.mp4        agent.v1.webm        agent.v1.jpg
  music.v1.mp4        music.v1.webm        music.v1.jpg
  cafe.v1.mp4         cafe.v1.webm         cafe.v1.jpg
  viewer-page.v1.mp4  viewer-page.v1.webm  viewer-page.v1.jpg
  commands.v1.mp4     commands.v1.webm     commands.v1.jpg
  audit.v1.mp4        audit.v1.webm        audit.v1.jpg
```

- 키 6개는 `apps/web/src/data/wizbot.tsx` 의 `landingShowcase` 와 같다. 파일 3개(mp4·webm·jpg 포스터)가 한 세트.
- **`.v1` 은 버전이다.** `/videos/*` 는 1년 immutable 캐시(`next.config.ts`)라 같은 이름으로 덮어쓰면 방문자 브라우저·CDN 에 옛 영상이 남는다.
  다시 찍으면 `v2` 로 저장하고 `wizbot.tsx` 의 `video('agent', 2)` 처럼 버전을 올린다.
- `public/` 은 Docker 이미지에 그대로 들어가므로 커밋만 하면 배포된다. 12개 파일 합계 20MB 안쪽을 목표로 한다(초과하면 Git LFS 검토).

## 무엇을 찍나 (항목별 장면)

| 키 | 장면 | 길이 |
|---|---|---|
| `agent` | 콘솔 우측 ✨ 패널에 「!디스코드 명령어 만들어줘」 입력 → 응답 → 명령어 목록에 새 명령어가 생김. (또는 방송 채팅 `!에이전트 …`) | 12~18초 |
| `music` | 방송 채팅 `!노래 신청 …` → 대기열에 추가되는 컨트롤러 → 미니 플레이어에서 단축키로 다음 곡 | 12~20초 |
| `cafe` | 카페 대문 이미지 에디터 → 저장 → 실제 카페 대문이 「방송 중」 이미지로 바뀜(새로고침) | 12~18초 |
| `viewer-page` | 설정 › 테마에서 색·글꼴 변경 → 시청자 페이지가 그 색으로 바뀜, 플레이리스트가 실시간 갱신 | 10~15초 |
| `commands` | 방송 채팅 `!추가 …` → 봇 응답 → 콘솔 명령어 목록에 반영 | 10~15초 |
| `audit` | 변경 기록 페이지에 본인·매니저·에이전트 행위자가 섞여 쌓인 화면을 스크롤 | 8~12초 |

## 녹화 방법

- **해상도**: 브라우저 창을 **1600×900**(또는 1920×1080)으로 맞추고 그 창만 녹화한다. 최종은 1280×720 으로 줄이므로 글자가 너무 작지 않게 브라우저 확대 110~125% 권장.
- **프레임**: 30fps. 60fps 는 용량만 늘고 UI 영상에선 차이가 없다.
- **소리 없음**으로 녹화한다(있어도 압축 때 제거).
- **길이**: 10~20초. 첫 1초는 정지 상태에서 시작해 포스터로 쓸 수 있게 하고, 마지막 1~2초는 결과 화면에서 멈춰 둔다.
- **화면 정리**: 라이트/다크 테마 중 하나로 통일, 브라우저 북마크바·확장 아이콘 숨김, 개인 정보(이메일·토큰·OBS 주소)가 화면에 나오지 않게. 커서는 보이게.
- **도구**: Windows 는 OBS(창 캡처, 30fps, 녹화 형식 mkv/mp4) 또는 `Win+G` 게임 바, macOS 는 `Shift+Cmd+5` 화면 기록. 원본은 화질을 높게(OBS 「녹화 품질: 고품질」) 두고 압축은 아래 ffmpeg 로 한다.

## 압축 (ffmpeg)

원본 `raw/agent.mov` 를 예로. 목표는 **mp4 3MB 이하, webm 은 그보다 작게**, 포스터 100KB 안쪽.

```bash
# 1) H.264 mp4 — 모든 브라우저. CRF 28 이 UI 화면에서 화질/용량 균형점 (용량이 크면 30, 글자가 뭉개지면 26)
ffmpeg -i raw/agent.mov -an \
  -vf "scale=1280:-2:flags=lanczos,fps=30" \
  -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart \
  agent.v1.mp4

# 2) VP9 webm — 같은 화질에 30~40% 작다. 크롬·파이어폭스가 이걸 먼저 고른다
ffmpeg -i raw/agent.mov -an \
  -vf "scale=1280:-2:flags=lanczos,fps=30" \
  -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -deadline good -cpu-used 2 \
  agent.v1.webm

# 3) 포스터 — 1초 지점 프레임. 영상 로드 전·모션 최소화 설정에서 보인다
ffmpeg -ss 1 -i agent.v1.mp4 -frames:v 1 -q:v 5 agent.v1.jpg

# 확인
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,codec_name agent.v1.mp4
```

- `-movflags +faststart`: 메타데이터를 앞으로 옮겨 다 받기 전에 재생이 시작된다 — 자동 재생 첫 프레임 지연을 줄인다.
- `-pix_fmt yuv420p`: 사파리·구형 기기 호환. 빼면 일부 환경에서 검은 화면.
- 여러 파일을 한 번에: `for k in agent music cafe viewer-page commands audit; do …; done` 로 위 세 명령을 돌리면 된다.
- 이 서버(도커 호스트)에는 ffmpeg 가 없다. 로컬 PC 에서 돌리거나 `docker run --rm -v "$PWD:/w" -w /w jrottenberg/ffmpeg:7-ubuntu …` 로 돌린다.

## 배치 뒤 확인

1. 파일 12~18개를 위 경로에 넣고 커밋 → dev 배포.
2. 랜딩에서 첫 영상이 자동 재생되고, 끝나면 다음 항목으로 넘어가며 진행 바가 따라오는지.
3. 항목을 클릭하면 즉시 그 영상으로 바뀌고 검은 화면 없이 크로스페이드되는지(다음 영상 preload).
4. 개발자 도구 Network 에서 영상 6개가 한꺼번에 받아지지 않고 현재+다음만 받는지, 응답 헤더 `Cache-Control: public, max-age=31536000, immutable` 인지.
5. 모바일 폭에서 영상이 위, 리스트가 아래로 쌓이는지. OS 「동작 줄이기」 설정에서는 포스터 + 재생 버튼으로 바뀌는지.

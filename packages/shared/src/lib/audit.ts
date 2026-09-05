/**
 * 설정 변경 감사 로그의 순수 규칙 (#175).
 *
 * 무엇을 남기나: streamerProcedure 를 지나는 **mutation 전부** — 본인 변경도, 어드민 대행(#71)도.
 * 어드민이 스트리머 콘솔을 몰래 바꿀 수 없게 하는 투명성 장치라 스트리머 본인도 자기 기록을 본다.
 */

/**
 * 기록하지 않는 경로 (사용자 확정, #175)
 * - 재생 조작: 방송 중 수십 번씩 눌리는 순간 동작 — 기록하면 소음
 * - 대기열에 곡을 넣고 빼는 것: 재생 기록이 이미 남는다
 * 단 「대기열 비우기」는 재생 기록에 안 남는 파괴적 동작이라 기록한다.
 */
export const AUDIT_EXCLUDED = new Set([
  'song.play',
  'song.pause',
  'song.togglePlay',
  'song.stop',
  'song.next',
  'song.seek',
  'song.setVolume',
  'song.setRepeat',
  'song.addToQueue',
  'song.removeFromQueue',
  'song.playNow',
  'song.addCurrentToFavorite',
  'songFavorite.enqueue',
  //  에이전트 대화 CRUD 는 설정 변경이 아니다 (#35) — 에이전트가 수행한 실제 변경은 별도로 남는다
  'agent.createConversation',
  'agent.deleteConversation',
  //  공지 읽음 표시는 설정 변경이 아니다 (#206)
  'notice.markRead',
  'notice.markAllRead',
  //  문의는 게시판 활동 — 설정 변경이 아니고 스레드 자체가 기록이다 (#206)
  'inquiry.create',
  'inquiry.reply',
]);

/** 값이 이보다 길면 잘라 남긴다 — 배경 base64(수 MB)·레이아웃 JSON 이 통째로 쌓이지 않게 */
const MAX_VALUE_LENGTH = 300;
/** 이 패턴이 든 키는 값 자체를 남기지 않는다 */
const SECRET_KEY = /token|secret|password|cookie|nid|authorization/i;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** 입력을 기록용으로 정리 — 비밀 키 마스킹, 긴 값 절단, 깊이 제한 */
export function sanitizeAuditInput(value: unknown, depth = 0): Json {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}… (${value.length}자)` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 4) return '…';
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => sanitizeAuditInput(item, depth + 1));
    if (value.length > 20) items.push(`… 외 ${value.length - 20}개`);
    return items;
  }
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '(비공개)' : sanitizeAuditInput(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * 사람이 읽는 이름. 없는 경로는 원문 그대로 보여준다 — 라벨이 빠졌다고 기록이 안 보이면 안 된다.
 */
export const AUDIT_LABELS: Record<string, string> = {
  'command.create': '명령어 추가',
  'command.update': '명령어 수정',
  'command.remove': '명령어 삭제',
  'command.setEnabled': '명령어 활성화 변경',
  'command.createRepeat': '반복 메시지 추가',
  'command.updateRepeat': '반복 메시지 수정',
  'command.removeRepeat': '반복 메시지 삭제',
  'shortcut.save': '바로가기 저장',
  'song.reorderQueue': '대기열 순서 변경',
  'song.clearQueue': '대기열 비우기',
  'song.setSourceType': '송출 소스 변경',
  'song.regenerateToken': '송출 주소 재발급',
  'song.setOverlaySettings': '자막 설정 변경',
  'song.setAutoPlay': '자동 재생 변경',
  'song.setHistoryPublic': '재생 기록 공개 변경',
  'song.setKeyboardShortcut': '전역 단축키 사용 변경',
  'song.setShortcuts': '전역 단축키 조합 변경',
  'songFavorite.createList': '즐겨찾기 목록 추가',
  'songFavorite.renameList': '즐겨찾기 목록 이름 변경',
  'songFavorite.removeList': '즐겨찾기 목록 삭제',
  'songFavorite.addSong': '즐겨찾기 곡 추가',
  'songFavorite.removeSong': '즐겨찾기 곡 삭제',
  'user.updateUserSetting': '계정 설정 변경',
  'user.saveTheme': '테마 변경',
  'user.deleteAccount': '탈퇴',
  'cafe.setEnabled': '카페 연동 사용 변경',
  'cafe.link': '카페 연결',
  'cafe.requestJoin': '카페 봇 가입 요청',
  'cafe.requestVerify': '카페 권한 확인 요청',
  'cafe.setYoutube': '유튜브 채널 변경',
  'cafe.saveLayout': '대문 이미지 레이아웃 저장',
  'cafe.uploadBackground': '대문 배경 업로드',
  'cafe.deleteBackground': '대문 배경 삭제',
  'cafe.requestGateFetch': '대문 불러오기 요청',
  'cafe.savePicks': '방송 상태 위치 저장·반영',
};

/** 챗봇 명령으로 바꾼 경우 (#175) — streamerProcedure 를 지나지 않아 chatbot/command.ts 가 직접 남긴다 */
export const CHAT_AUDIT_LABELS: Record<string, string> = {
  'chat.commandCreate': '명령어 추가 (채팅)',
  'chat.commandUpdate': '명령어 수정 (채팅)',
  'chat.commandDelete': '명령어 삭제 (채팅)',
  'chat.repeatCreate': '반복 메시지 추가 (채팅)',
  'chat.repeatDelete': '반복 메시지 삭제 (채팅)',
};

/** 채팅 호출자 표기 — 닉네임과 치지직 채널 id (동명이인 구분) */
export function chatActorName(sender: { senderNickname: string; senderChannelId?: string }): string {
  const name = sender.senderChannelId ? `${sender.senderNickname} (${sender.senderChannelId})` : sender.senderNickname;
  return name.slice(0, 120);
}

export function auditLabel(procedure: string): string {
  return AUDIT_LABELS[procedure] ?? CHAT_AUDIT_LABELS[procedure] ?? procedure;
}

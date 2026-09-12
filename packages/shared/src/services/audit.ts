import type { Prisma } from '@prisma/client';

import { ACCESS_AUDIT_LABELS, AUDIT_LABELS, CHAT_AUDIT_LABELS } from '../lib/audit';

/** 목록 화면의 페이지 크기 상한 (#265) */
export const AUDIT_PAGE_SIZES = [20, 50, 100] as const;

/**
 * 키워드 검색 (#265) — 한 칸에 입력한 말을 아래 넷에 OR 로 건다.
 * - 경로(procedure) 부분 일치 (`command.update`)
 * - 한글 라벨 — 라벨은 클라이언트 표기용 맵이라 서버에서 거꾸로 procedure 키를 찾아 IN 으로
 * - 기록된 입력(input JSON) 문자열 포함 — 명령어 이름·응답 문구로 찾을 수 있게. MySQL JSON 은 루트 경로 `$` 를 준다
 * - 채팅으로 바꾼 사람 닉네임(actorName)
 */
export function auditSearchWhere(q: string): Prisma.AuditLogWhereInput | null {
  const keyword = q.trim();
  if (!keyword) return null;
  const labelled = proceduresMatchingLabel(keyword);
  return {
    OR: [
      { procedure: { contains: keyword } },
      ...(labelled.length > 0 ? [{ procedure: { in: labelled } }] : []),
      { input: { path: '$', string_contains: keyword } },
      { actorName: { contains: keyword } },
    ],
  };
}

/** 라벨에 키워드가 들어가는 procedure 키 목록 — 대소문자·공백 무시 */
export function proceduresMatchingLabel(keyword: string): string[] {
  const needle = normalize(keyword);
  if (!needle) return [];
  return Object.entries({ ...AUDIT_LABELS, ...CHAT_AUDIT_LABELS, ...ACCESS_AUDIT_LABELS })
    .filter(([, label]) => normalize(label).includes(needle))
    .map(([procedure]) => procedure);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

/** 최근 N일 필터의 시작 시각 */
export function sinceDays(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

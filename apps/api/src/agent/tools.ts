import type Anthropic from '@anthropic-ai/sdk';
import type { PrismaClient } from '@prisma/client';
import {
  commandService,
  playbackService,
  repeatService,
  shortcutService,
  songFavoriteService,
  userSettingService,
} from '@wizbot/shared/services';

/**
 * 에이전트 tool (#35 PR1 — 읽기 전용). 서비스 계층을 로그인 스트리머 스코프로 노출한다.
 * 쓰기 tool(명령어 추가·재생 제어 등)과 승인 게이트는 PR2 에서 붙는다.
 */

const RESULT_MAX_CHARS = 8000;

function toResult(value: unknown): string {
  const text = JSON.stringify(value, null, 1) ?? 'null';
  return text.length > RESULT_MAX_CHARS ? `${text.slice(0, RESULT_MAX_CHARS)}\n…(잘림)` : text;
}

const noInput = { type: 'object' as const, properties: {}, additionalProperties: false };

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_commands',
    description: '이 채널의 챗봇 명령어(단순 응답·기능 명령어) 전체 목록을 가져온다.',
    input_schema: noInput,
  },
  {
    name: 'list_repeats',
    description: '이 채널의 반복 메시지(주기적으로 채팅에 보내는 메시지) 목록을 가져온다.',
    input_schema: noInput,
  },
  {
    name: 'get_playback',
    description: '뮤직 플레이어의 현재 상태 — 재생 중인 곡, 재생/일시정지, 볼륨, 대기열 전체.',
    input_schema: noInput,
  },
  {
    name: 'list_favorites',
    description: '즐겨찾기(미리 담아두는 재생목록) 목록 — 이름, 곡 수, 대표 여부.',
    input_schema: noInput,
  },
  {
    name: 'get_favorite',
    description: '즐겨찾기 하나의 곡 목록을 가져온다.',
    input_schema: {
      type: 'object',
      properties: { favoriteId: { type: 'number', description: 'list_favorites 가 돌려준 id' } },
      required: ['favoriteId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_shortcuts',
    description: '시청자 페이지에 노출되는 링크(바로가기) 목록.',
    input_schema: noInput,
  },
  {
    name: 'get_user_setting',
    description: '채널 기본 설정 — 챗봇 사용 여부, 노래 신청 설정 등.',
    input_schema: noInput,
  },
  {
    name: 'search_audit_log',
    description: '이 채널의 설정 변경 기록을 검색한다. 누가(스트리머/관리자/챗봇/에이전트) 언제 무엇을 바꿨는지.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '경로/행위자 이름에 대한 부분 일치 검색어 (선택)' },
        limit: { type: 'number', description: '최대 개수 (기본 20, 최대 50)' },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

export async function runTool(
  prisma: PrismaClient,
  userId: number,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'list_commands':
      return toResult(await commandService.listCommands(prisma, userId));
    case 'list_repeats':
      return toResult(await repeatService.listRepeats(prisma, userId));
    case 'get_playback':
      return toResult(await playbackService.getPlayback(prisma, userId));
    case 'list_favorites':
      return toResult(await songFavoriteService.listFavorites(prisma, userId));
    case 'get_favorite':
      return toResult(await songFavoriteService.getFavorite(prisma, userId, Number(input.favoriteId)));
    case 'list_shortcuts':
      return toResult(await shortcutService.listShortcuts(prisma, userId));
    case 'get_user_setting':
      return toResult(await userSettingService.getUserSetting(prisma, userId));
    case 'search_audit_log': {
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim() : null;
      const rows = await prisma.auditLog.findMany({
        where: {
          userId,
          ...(query ? { OR: [{ procedure: { contains: query } }, { actorName: { contains: query } }] } : {}),
        },
        orderBy: { id: 'desc' },
        take: limit,
        select: { procedure: true, actorType: true, actorName: true, input: true, createdAt: true },
      });
      return toResult(rows.map((row) => ({ ...row, input: JSON.stringify(row.input)?.slice(0, 200) })));
    }
    default:
      return `알 수 없는 tool: ${name}`;
  }
}

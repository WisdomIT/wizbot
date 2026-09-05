import type { ChatbotPermission, PrismaClient } from '@prisma/client';
import { chatbotFunctionDefinitionMap, isChatbotFunctionKey } from '@wizbot/shared/chatbot/definitions';
import { getManualPage, listManualPages, searchManual } from '@wizbot/shared/lib/manual';
import { notifyAdminsOfInquiry } from '@wizbot/shared/router';
import {
  commandService,
  inquiryService,
  playbackService,
  repeatService,
  ServiceError,
  shortcutService,
  songFavoriteService,
  songService,
  userSettingService,
} from '@wizbot/shared/services';

import { recordAgentAudit } from './audit';
import type { PendingCard, ToolDef, ToolRunResult } from './llm/types';

/**
 * 에이전트 tool (#35). 서비스 계층을 로그인 스트리머 스코프로 노출한다.
 * - 파괴적 작업(삭제·비우기)과 운영자에게 발송되는 작업(문의)은 `confirmed` 2단계 —
 *   사용자의 명시적 동의 없이는 실행되지 않는다 (시스템 프롬프트의 확인 규칙과 한 쌍)
 * - 설정을 바꾸는 tool 은 변경 기록(AuditLog, actor=AGENT)에 남는다.
 *   재생 조작·큐 추가·문의(AUDIT_EXCLUDED)는 콘솔과 같은 기준으로 제외
 */

const RESULT_MAX_CHARS = 8000;
/** 곡 신청·대기열 표기용 행위자 이름 */
const AGENT_ACTOR = '에이전트';

function toResult(value: unknown): string {
  const text = JSON.stringify(value, null, 1) ?? 'null';
  return text.length > RESULT_MAX_CHARS ? `${text.slice(0, RESULT_MAX_CHARS)}\n…(잘림)` : text;
}

const noInput = { type: 'object' as const, properties: {}, additionalProperties: false };
const id = { type: 'number' as const };

/**
 * 확인 카드가 뜨는 tool (pelican tool_confirmation 이식) — 호출 즉시 턴이 멈추고 카드가 뜬다.
 * 실행 경로는 승인 mutation 뿐이라 모델이 뭐라 하든 시스템이 막는다.
 */
function requireText(value: unknown, label: string, max: number): string {
  const text = String(value ?? '').trim();
  if (!text) throw new ServiceError('INVALID_INPUT', `${label}을(를) 입력해주세요.`);
  if (text.length > max) throw new ServiceError('INVALID_INPUT', `${label}은(는) ${max}자까지입니다. (현재 ${text.length}자)`);
  return text;
}

/** 채팅으로 전송되는 텍스트 — 웹의 chatMessage 규칙과 동일 (100자) */
function requireChatText(value: unknown, label: string): string {
  return requireText(value, label, 100);
}

function requireId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ServiceError('INVALID_INPUT', `${label} 은(는) 양의 정수 id 여야 합니다.`);
  return id;
}

function requirePermission(value: unknown): ChatbotPermission {
  const permission = String(value ?? '');
  if (permission !== 'STREAMER' && permission !== 'MANAGER' && permission !== 'VIEWER') {
    throw new ServiceError('INVALID_INPUT', 'permission 은 STREAMER/MANAGER/VIEWER 중 하나여야 합니다.');
  }
  return permission;
}

export const CONFIRM_TOOLS = new Set(['delete_command', 'delete_repeat', 'delete_shortcut', 'clear_queue', 'create_inquiry']);

export const AGENT_TOOLS: ToolDef[] = [
  /* ── 읽기 ── */
  { name: 'list_commands', description: '이 채널의 챗봇 명령어(단순 응답 echo·기능 function) 전체 목록.', inputSchema: noInput },
  { name: 'list_repeats', description: '반복 메시지(주기적으로 채팅에 보내는 메시지) 목록.', inputSchema: noInput },
  { name: 'get_playback', description: '뮤직 플레이어 상태 — 재생 중인 곡, 재생/일시정지, 볼륨, 대기열.', inputSchema: noInput },
  { name: 'list_favorites', description: '즐겨찾기(미리 담아두는 재생목록) 목록.', inputSchema: noInput },
  {
    name: 'get_favorite', description: '즐겨찾기 하나의 곡 목록.',
    inputSchema: { type: 'object', properties: { favoriteId: id }, required: ['favoriteId'], additionalProperties: false },
  },
  { name: 'list_shortcuts', description: '시청자 페이지에 노출되는 링크(바로가기) 목록.', inputSchema: noInput },
  { name: 'get_user_setting', description: '채널 기본 설정 — 챗봇 사용 여부, 노래 신청 설정 등.', inputSchema: noInput },
  {
    name: 'search_audit_log', description: '설정 변경 기록 검색 — 누가(본인/관리자/챗봇/에이전트) 언제 무엇을 바꿨는지.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '경로/행위자 부분 일치 (선택)' }, limit: { type: 'number', description: '기본 20, 최대 50' } },
      required: [], additionalProperties: false,
    },
  },
  {
    name: 'list_manual_pages',
    description: 'Lists the user manual pages (slug, title, audience, description). The manual is the source of truth for how Wizbot features work.',
    inputSchema: noInput,
  },
  {
    name: 'read_manual_page',
    description: 'Reads one manual page in full. Use the slug from list_manual_pages or search_manual.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'], additionalProperties: false,
    },
  },
  {
    name: 'search_manual',
    description: 'Searches the manual by keyword and returns matching pages with a snippet. Use before answering how-to or policy questions.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Korean keyword' } },
      required: ['query'], additionalProperties: false,
    },
  },
  {
    name: 'list_available_functions',
    description: '기능(function) 명령어로 쓸 수 있는 기능 카탈로그 — create_function_command 의 func 값과 설명.',
    inputSchema: noInput,
  },

  /* ── 명령어 ── */
  {
    name: 'create_echo_command', description: '단순 응답(echo) 명령어를 추가한다.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string', description: '명령어 이름 (! 는 자동 처리)' }, response: { type: 'string' } },
      required: ['command', 'response'], additionalProperties: false,
    },
  },
  {
    name: 'update_echo_command', description: 'echo 명령어를 수정한다. id 는 list_commands 로 확인.',
    inputSchema: {
      type: 'object',
      properties: { id, command: { type: 'string', description: '바꿀 이름 (선택)' }, response: { type: 'string' } },
      required: ['id', 'response'], additionalProperties: false,
    },
  },
  {
    name: 'create_function_command', description: '기능(function) 명령어를 추가한다. func 는 list_available_functions 로 확인.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        func: { type: 'string', description: '기능 키' },
        permission: { type: 'string', enum: ['STREAMER', 'MANAGER', 'VIEWER'], description: '누가 쓸 수 있는지' },
        option: { type: 'string', description: '대상 지정이 필요한 기능의 옵션 — updateSpecificCommandEcho 는 대상 echo 명령어의 이름 또는 id' },
      },
      required: ['command', 'func', 'permission'], additionalProperties: false,
    },
  },
  {
    name: 'update_function_command', description: 'function 명령어를 수정한다 — command·func·permission 전체를 넘긴다 (기존 값은 list_commands 로 확인).',
    inputSchema: {
      type: 'object',
      properties: {
        id, command: { type: 'string' }, func: { type: 'string' },
        permission: { type: 'string', enum: ['STREAMER', 'MANAGER', 'VIEWER'] },
        option: { type: 'string' },
      },
      required: ['id', 'command', 'func', 'permission'], additionalProperties: false,
    },
  },
  {
    name: 'set_command_enabled', description: '명령어를 켜거나 끈다 (삭제하지 않고 잠시 중지할 때).',
    inputSchema: {
      type: 'object',
      properties: { id, type: { type: 'string', enum: ['echo', 'function'] }, enabled: { type: 'boolean' } },
      required: ['id', 'type', 'enabled'], additionalProperties: false,
    },
  },
  {
    name: 'delete_command', description: 'Deletes a command. A confirmation card is shown to the user — call directly, do not ask first.',
    inputSchema: {
      type: 'object',
      properties: { id, type: { type: 'string', enum: ['echo', 'function'] } },
      required: ['id', 'type'], additionalProperties: false,
    },
  },

  /* ── 반복 메시지 ── */
  {
    name: 'create_repeat', description: '반복 메시지를 추가한다.',
    inputSchema: {
      type: 'object',
      properties: { response: { type: 'string', description: '보낼 메시지' }, intervalSeconds: { type: 'number', description: '주기 (초)' } },
      required: ['response', 'intervalSeconds'], additionalProperties: false,
    },
  },
  {
    name: 'update_repeat', description: '반복 메시지를 수정한다 — response·intervalSeconds 전체를 넘긴다.',
    inputSchema: {
      type: 'object',
      properties: { id, response: { type: 'string' }, intervalSeconds: { type: 'number' } },
      required: ['id', 'response', 'intervalSeconds'], additionalProperties: false,
    },
  },
  {
    name: 'set_repeat_enabled', description: '반복 메시지를 켜거나 끈다.',
    inputSchema: { type: 'object', properties: { id, enabled: { type: 'boolean' } }, required: ['id', 'enabled'], additionalProperties: false },
  },
  {
    name: 'delete_repeat', description: 'Deletes a repeat message. A confirmation card is shown to the user — call directly, do not ask first.',
    inputSchema: { type: 'object', properties: { id }, required: ['id'], additionalProperties: false },
  },

  /* ── 링크 ── */
  {
    name: 'create_shortcut', description: '시청자 페이지 링크를 추가한다.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, url: { type: 'string', description: 'https:// 주소' },
        icon: { type: 'string', description: 'lucide 아이콘 이름 (기본 link)' },
      },
      required: ['name', 'url'], additionalProperties: false,
    },
  },
  {
    name: 'update_shortcut', description: '링크를 수정한다 — name·url·icon 전체를 넘긴다 (기존 값은 list_shortcuts 로 확인).',
    inputSchema: {
      type: 'object',
      properties: { id, name: { type: 'string' }, url: { type: 'string' }, icon: { type: 'string' } },
      required: ['id', 'name', 'url', 'icon'], additionalProperties: false,
    },
  },
  {
    name: 'delete_shortcut', description: 'Deletes a viewer-page link. A confirmation card is shown to the user — call directly, do not ask first.',
    inputSchema: { type: 'object', properties: { id }, required: ['id'], additionalProperties: false },
  },

  /* ── 뮤직 플레이어 ── */
  {
    name: 'add_song', description: '대기열에 곡을 추가한다 (유튜브 검색어 또는 URL). 스트리머 본인 추가라 신청 정책을 우회한다.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'control_playback', description: '재생 제어 — play(재생)/pause(일시정지)/next(다음 곡)/stop(정지).',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['play', 'pause', 'next', 'stop'] } },
      required: ['action'], additionalProperties: false,
    },
  },
  {
    name: 'set_volume', description: '볼륨을 바꾼다 (0~100).',
    inputSchema: { type: 'object', properties: { volume: { type: 'number' } }, required: ['volume'], additionalProperties: false },
  },
  {
    name: 'clear_queue', description: 'Clears the entire song queue. A confirmation card is shown to the user — call directly, do not ask first.',
    inputSchema: noInput,
  },
  {
    name: 'enqueue_favorite', description: '즐겨찾기의 곡들을 대기열에 넣는다.',
    inputSchema: {
      type: 'object',
      properties: { favoriteId: id, shuffle: { type: 'boolean', description: '섞어서 넣기' } },
      required: ['favoriteId'], additionalProperties: false,
    },
  },
  {
    name: 'import_playlist', description: '유튜브 재생목록을 즐겨찾기로 가져온다(뒤에 추가).',
    inputSchema: {
      type: 'object',
      properties: { favoriteId: id, url: { type: 'string', description: '유튜브 재생목록 URL' } },
      required: ['favoriteId', 'url'], additionalProperties: false,
    },
  },

  /* ── 문의 ── */
  {
    name: 'create_inquiry', description: 'Sends an inquiry to the operators. A confirmation card with the title and body is shown to the user — call directly with the drafted content, do not ask first.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, body: { type: 'string', description: '마크다운 가능 (markdown allowed)' } },
      required: ['title', 'body'], additionalProperties: false,
    },
  },
];

/** 설정을 바꾸는 tool — 성공 시 변경 기록(actor=AGENT)에 남긴다. AUDIT_EXCLUDED 와 같은 기준으로 재생·큐·문의는 제외 */
const AUDITED_TOOLS = new Set([
  'create_echo_command', 'update_echo_command', 'create_function_command', 'update_function_command',
  'set_command_enabled', 'delete_command',
  'create_repeat', 'update_repeat', 'set_repeat_enabled', 'delete_repeat',
  'create_shortcut', 'update_shortcut', 'delete_shortcut',
  'import_playlist', 'clear_queue',
]);

export async function runTool(
  prisma: PrismaClient,
  userId: number,
  conversationId: number,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolRunResult> {
  //  확인 대상은 실행하지 않는다 — 카드를 만들어 돌려주고 턴이 멈춘다.
  //  카드 생성 실패(대상 없음 등)는 ServiceError 로 던져져 모델에게 오류 결과로 돌아간다 (pelican 과 동일)
  if (CONFIRM_TOOLS.has(name)) {
    return { card: await buildCard(prisma, userId, name, input) };
  }
  return executeConfirmed(prisma, userId, conversationId, name, input);
}

/** 승인 뒤(또는 확인 불필요 tool)의 실제 실행 — 성공한 설정 변경은 감사 기록에 남는다 */
export async function executeConfirmed(
  prisma: PrismaClient,
  userId: number,
  conversationId: number,
  name: string,
  input: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const result = await execute(prisma, userId, name, input);
  if (result.ok && AUDITED_TOOLS.has(name)) {
    await recordAgentAudit(prisma, userId, conversationId, name, input);
  }
  return { content: result.text, isError: !result.ok };
}

/**
 * function 명령어의 option 검증·해석 (#238 실측 버그) — updateSpecificCommandEcho 의 option 은
 * echo 명령어 **id** 인데 에이전트가 이름("멤버")을 넘겨 깨진 값이 저장됐다. 웹 라우터의 검증을
 * tool 쪽에도 두되, 이름으로 와도 소유한 echo 를 찾아 id 로 바꿔준다.
 */
async function resolveFunctionOption(
  prisma: PrismaClient,
  userId: number,
  func: string,
  option: string | null,
): Promise<string | null> {
  const definition = chatbotFunctionDefinitionMap[func as keyof typeof chatbotFunctionDefinitionMap];
  if (!definition?.option) return null; // option 을 안 쓰는 기능 — 넘어온 값은 버린다
  if (definition.option.input === 'echoCommandSelect') {
    if (!option?.trim()) {
      throw new ServiceError('INVALID_INPUT', `${func} 는 대상 echo 명령어(option)가 필요합니다. list_commands 로 확인하세요.`);
    }
    const trimmed = option.trim();
    const byId = /^\d+$/.test(trimmed)
      ? await prisma.chatbotEchoCommand.findFirst({ where: { userId, id: Number(trimmed) } })
      : null;
    const target = byId ?? (await commandService.findEchoCommandByName(prisma, userId, trimmed));
    if (!target) {
      throw new ServiceError('INVALID_INPUT', `대상 echo 명령어를 찾을 수 없습니다: ${trimmed}. list_commands 로 이름/id 를 확인하세요.`);
    }
    return String(target.id);
  }
  return option;
}

/** 카드 내용 — 무엇이 실행되는지 검증하며 구체적으로. 대상이 없으면 여기서 던진다 */
async function buildCard(prisma: PrismaClient, userId: number, name: string, input: Record<string, unknown>): Promise<PendingCard> {
  switch (name) {
    case 'delete_command': {
      const commandId = Number(input.id);
      const found =
        input.type === 'function'
          ? await commandService.getFunctionCommand(prisma, userId, commandId)
          : await commandService.getEchoCommand(prisma, userId, commandId);
      return { title: '명령어 삭제', lines: [`!${found.command} 명령어를 삭제합니다.`, '삭제하면 되돌릴 수 없습니다.'] };
    }
    case 'delete_repeat': {
      const repeat = await repeatService.getRepeat(prisma, userId, Number(input.id));
      return { title: '반복 메시지 삭제', lines: [`"${repeat.response.slice(0, 80)}" (${repeat.interval}초 주기) 를 삭제합니다.`] };
    }
    case 'delete_shortcut': {
      const shortcut = await prisma.userShortcut.findFirst({ where: { userId, id: Number(input.id) } });
      if (!shortcut) throw new ServiceError('NOT_FOUND', '링크를 찾을 수 없습니다.');
      return { title: '링크 삭제', lines: [`"${shortcut.name}" (${shortcut.url}) 링크를 삭제합니다.`] };
    }
    case 'clear_queue': {
      const queue = await songService.listQueue(prisma, userId);
      if (queue.length === 0) throw new ServiceError('INVALID_INPUT', '대기열이 이미 비어 있습니다.');
      return { title: '대기열 비우기', lines: [`대기열의 ${queue.length}곡을 모두 삭제합니다.`, '삭제하면 되돌릴 수 없습니다.'] };
    }
    case 'create_inquiry': {
      const title = requireText(input.title, '제목', 200);
      const inquiryBody = requireText(input.body, '내용', 64 * 1024);
      return {
        title: '운영자에게 문의 발송',
        lines: [`제목: ${title}`, inquiryBody.length > 200 ? `${inquiryBody.slice(0, 200)}…` : inquiryBody],
      };
    }
    default:
      throw new ServiceError('INVALID_INPUT', `확인 대상이 아닌 tool: ${name}`);
  }
}

async function execute(
  prisma: PrismaClient,
  userId: number,
  name: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; text: string }> {
  const ok = (text: string) => ({ ok: true, text });
  const pending = (text: string) => ({ ok: false, text });

  switch (name) {
    /* ── 읽기 ── */
    case 'list_commands':
      return ok(toResult(await commandService.listCommands(prisma, userId)));
    case 'list_repeats':
      return ok(toResult(await repeatService.listRepeats(prisma, userId)));
    case 'get_playback':
      return ok(toResult(await playbackService.getPlayback(prisma, userId)));
    case 'list_favorites':
      return ok(toResult(await songFavoriteService.listFavorites(prisma, userId)));
    case 'get_favorite':
      return ok(toResult(await songFavoriteService.getFavorite(prisma, userId, requireId(input.favoriteId, 'favoriteId'))));
    case 'list_shortcuts':
      return ok(toResult(await shortcutService.listShortcuts(prisma, userId)));
    case 'get_user_setting':
      return ok(toResult(await userSettingService.getUserSetting(prisma, userId)));
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
      return ok(toResult(rows.map((row) => ({ ...row, input: JSON.stringify(row.input)?.slice(0, 200) }))));
    }
    case 'list_manual_pages':
      return ok(toResult(listManualPages()));
    case 'read_manual_page': {
      const page = getManualPage(String(input.slug));
      if (!page) return pending(`해당 문서가 없습니다: ${String(input.slug)}. list_manual_pages 로 확인하세요.`);
      return ok(`# ${page.title}\n\n${page.body}`.slice(0, RESULT_MAX_CHARS));
    }
    case 'search_manual':
      return ok(toResult(searchManual(String(input.query))));
    case 'list_available_functions':
      return ok(toResult(
        Object.entries(chatbotFunctionDefinitionMap).map(([key, def]) => ({
          func: key,
          description: def.descriptionShort,
          option: def.option ? def.option.label : null,
        })),
      ));

    /* ── 명령어 ── */
    case 'create_echo_command':
      return ok(toResult(await commandService.createEchoCommand(prisma, {
        userId, command: requireText(input.command, '명령어 이름', 20), response: requireChatText(input.response, '응답'),
      })));
    case 'update_echo_command':
      return ok(toResult(await commandService.updateEchoCommand(prisma, {
        userId, id: requireId(input.id, 'id'),
        ...(typeof input.command === 'string' ? { command: requireText(input.command, '명령어 이름', 20) } : {}),
        response: requireChatText(input.response, '응답'),
      })));
    case 'create_function_command': {
      const func = String(input.func);
      if (!isChatbotFunctionKey(func)) return pending(`알 수 없는 기능: ${func}. list_available_functions 로 확인하세요.`);
      const option = await resolveFunctionOption(prisma, userId, func, typeof input.option === 'string' ? input.option : null);
      return ok(toResult(await commandService.createFunctionCommand(prisma, {
        userId, command: requireText(input.command, '명령어 이름', 20), permission: requirePermission(input.permission),
        function: func, option,
      })));
    }
    case 'update_function_command': {
      const func = String(input.func);
      if (!isChatbotFunctionKey(func)) return pending(`알 수 없는 기능: ${func}. list_available_functions 로 확인하세요.`);
      const option = await resolveFunctionOption(prisma, userId, func, typeof input.option === 'string' ? input.option : null);
      return ok(toResult(await commandService.updateFunctionCommand(prisma, {
        userId, id: requireId(input.id, 'id'), command: requireText(input.command, '명령어 이름', 20),
        permission: requirePermission(input.permission),
        function: func, option,
      })));
    }
    case 'set_command_enabled':
      return ok(toResult(await commandService.setCommandEnabled(
        prisma, userId, requireId(input.id, 'id'), input.type === 'function' ? 'function' : 'echo', input.enabled === true,
      )));
    case 'delete_command': {
      const count = await commandService.deleteCommand(
        prisma, userId, requireId(input.id, 'id'), input.type === 'function' ? 'function' : 'echo',
      );
      return count > 0 ? ok('삭제했습니다.') : pending('해당 명령어가 없습니다.');
    }

    /* ── 반복 메시지 ── */
    case 'create_repeat':
      return ok(toResult(await repeatService.createRepeat(prisma, {
        userId, response: requireChatText(input.response, '반복 메시지'), interval: requireId(input.intervalSeconds, '주기(초)'),
      })));
    case 'update_repeat':
      return ok(toResult(await repeatService.updateRepeat(prisma, {
        userId, id: requireId(input.id, 'id'), response: requireChatText(input.response, '반복 메시지'), interval: requireId(input.intervalSeconds, '주기(초)'),
      })));
    case 'set_repeat_enabled':
      return ok(toResult(await repeatService.setRepeatEnabled(prisma, userId, requireId(input.id, 'id'), input.enabled === true)));
    case 'delete_repeat': {
      await repeatService.deleteRepeat(prisma, userId, requireId(input.id, 'id'));
      return ok('삭제했습니다.');
    }

    /* ── 링크 ── */
    case 'create_shortcut':
      return ok(toResult(await shortcutService.createShortcut(prisma, {
        userId, name: String(input.name), url: String(input.url),
        icon: typeof input.icon === 'string' && input.icon ? input.icon : 'link',
      })));
    case 'update_shortcut':
      return ok(toResult(await shortcutService.updateShortcut(prisma, {
        userId, id: requireId(input.id, 'id'), name: String(input.name), url: String(input.url), icon: String(input.icon),
      })));
    case 'delete_shortcut': {
      await shortcutService.deleteShortcut(prisma, userId, requireId(input.id, 'id'));
      return ok('삭제했습니다.');
    }

    /* ── 뮤직 플레이어 ── */
    case 'add_song':
      return ok(toResult(await songService.requestSong(
        prisma, userId, String(input.query), { channelId: null, nickname: AGENT_ACTOR }, { bypassPolicy: true },
      )));
    case 'control_playback': {
      switch (input.action) {
        case 'play': return ok(toResult(await playbackService.play(prisma, userId)));
        case 'pause': return ok(toResult(await playbackService.pause(prisma, userId)));
        case 'next': return ok(toResult(await playbackService.skipToNext(prisma, userId, AGENT_ACTOR)));
        case 'stop': return ok(toResult(await playbackService.stop(prisma, userId, AGENT_ACTOR)));
        default: return pending(`알 수 없는 동작: ${String(input.action)}`);
      }
    }
    case 'set_volume': {
      const raw = Number(input.volume);
      if (!Number.isFinite(raw)) throw new ServiceError('INVALID_INPUT', 'volume 은 0~100 숫자여야 합니다.');
      const volume = Math.min(Math.max(Math.round(raw), 0), 100);
      return ok(toResult(await playbackService.setVolume(prisma, userId, volume)));
    }
    case 'clear_queue':
      return ok(toResult(await songService.clearQueue(prisma, userId, AGENT_ACTOR)));
    case 'enqueue_favorite':
      return ok(toResult(await songFavoriteService.enqueueFavorite(
        prisma, userId, requireId(input.favoriteId, 'favoriteId'), { shuffle: input.shuffle === true, requester: AGENT_ACTOR },
      )));
    case 'import_playlist':
      return ok(toResult(await songFavoriteService.importPlaylist(prisma, userId, requireId(input.favoriteId, 'favoriteId'), String(input.url))));

    /* ── 문의 ── */
    case 'create_inquiry': {
      const inquiry = await inquiryService.create(prisma, userId, { title: String(input.title), body: String(input.body) });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { channelName: true, channelImageUrl: true } });
      void notifyAdminsOfInquiry(prisma, inquiry, user, '새 문의');
      return ok(toResult({ id: inquiry.id, title: inquiry.title }));
    }

    default:
      return pending(`알 수 없는 tool: ${name}`);
  }
}

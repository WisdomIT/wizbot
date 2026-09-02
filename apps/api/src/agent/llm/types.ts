/**
 * LLM 어댑터 공통 타입 (#35, pelican-concierge #3 구조).
 *
 * - 턴 안의 tool 루프는 어댑터 내부에서 **프로바이더 네이티브 포맷**으로 돈다 —
 *   각 프로바이더의 캐싱·thinking 규칙을 그대로 지키기 위해서다.
 * - 턴 사이 히스토리는 **텍스트만** 다시 보낸다(사용자/어시스턴트 최종 발화).
 *   tool 상세는 DB 에 남아 화면·로그가 쓰지만 다시 보내지 않는다 — 토큰 절감이고,
 *   프로바이더를 오가도(폴백) 히스토리가 호환된다.
 */

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema (Anthropic input_schema 형태를 정준으로 쓰고 어댑터가 변환) */
  inputSchema: Record<string, unknown>;
}

/** DB 기록·화면용 블록 — 지금까지의 저장 형태(Anthropic 유사)를 유지한다 */
export type RecordBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'web_search'; query: string };

export interface RecordMessage {
  role: 'user' | 'assistant';
  content: RecordBlock[];
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

/** 승인 카드 내용 — 무엇이 실행되는지 사용자 언어로 */
export interface PendingCard {
  title: string;
  lines: string[];
}

/** tool 실행 결과 — card 가 오면 확인이 필요한 작업이다: 어댑터는 턴을 멈춰야 한다 */
export type ToolRunResult = { content: string; isError: boolean } | { card: PendingCard };

/** 턴이 승인 대기로 멈춘 상태 — native 는 같은 턴을 재개하기 위한 어댑터별 직렬화 상태 */
export interface TurnPending {
  toolUseId: string;
  tool: string;
  input: Record<string, unknown>;
  card: PendingCard;
  native: unknown;
}

export interface TurnRequest {
  system: string;
  tools: ToolDef[];
  /** 이전 턴들의 텍스트 발화 */
  history: { role: 'user' | 'assistant'; text: string }[];
  userText: string;
  webSearch: boolean;
  maxIterations: number;
  signal: AbortSignal;
  onText: (delta: string) => void;
  onToolStart: (name: string) => void;
  runTool: (name: string, input: Record<string, unknown>) => Promise<ToolRunResult>;
}

export interface TurnOutcome {
  /** 이 턴 동안 생긴 메시지들 — DB 저장·화면 렌더용 */
  record: RecordMessage[];
  usage: TurnUsage;
  /** 이 턴에서 텍스트를 한 글자라도 내보냈는가 — 폴백 가능 여부 판정 */
  emittedText: boolean;
  /** 확인 카드로 턴이 멈췄다 — 승인/거절 후 resumeTurn 으로 이어진다 (pelican pendingResult) */
  pending?: TurnPending;
}

/** 승인/거절이 끝난 tool 의 결과 — 재개 시 짝을 맞춰 넣는다 */
export interface ResolvedTool {
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ProviderAdapter {
  runTurn(request: TurnRequest): Promise<TurnOutcome>;
  /** 승인 카드로 멈춘 턴을 native 상태에서 이어 돈다 */
  resumeTurn(native: unknown, resolved: ResolvedTool, request: TurnRequest): Promise<TurnOutcome>;
}

/** 프로바이더 API 장애 — 폴백 체인의 판정 근거. tool 실행 오류는 여기 해당하지 않는다 */
export class ProviderApiError extends Error {
  constructor(
    /** HTTP 상태 (네트워크·타임아웃은 null) */
    public readonly status: number | null,
    message: string,
    /** 이 오류 전에 이미 텍스트를 내보냈는가 — true 면 폴백하지 않는다(중복 출력 방지) */
    public readonly emittedText: boolean = false,
  ) {
    super(message);
    this.name = 'ProviderApiError';
  }
}

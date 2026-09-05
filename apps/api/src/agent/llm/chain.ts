/* eslint-disable no-console */
import type { AgentProvider, PrismaClient } from '@prisma/client';
import { notifyService } from '@wizbot/shared/services';

import { AnthropicAdapter } from './anthropic';
import { OpenAiCompatAdapter } from './compat';
import { GeminiAdapter } from './gemini';
import { OpenAiAdapter } from './openai';
import { type ProviderAdapter, ProviderApiError, type ResolvedTool, type TurnOutcome, type TurnRequest } from './types';

/**
 * 프로바이더 목록을 순서대로 써 나간다 (pelican-concierge #89 이식).
 *
 * - 실패한 항목은 잠시 쉰다(cooldown) — 쿼터는 정시에 풀리고 장애는 끝나므로 버리지 않고
 *   쉬게만 한다. 쉬는 상태는 **메모리에만** 둔다(설정에 쓰지 않는다 — 장애 조치는 운영자의
 *   설정을 바꾸는 일이 아니고, 사실은 저절로 만료되어야 한다). API 는 replicas=1 전제.
 * - 전부 쉬고 있으면 그래도 1순위로 간다 — 아무 데도 안 보내는 것보다 한 번 더 두드려
 *   보고 진짜 이유를 말하는 편이 낫다.
 * - 폴백·복귀는 운영자에게 알린다(#207 ERROR 채널) — 한 사건에 한 번.
 * - 이미 텍스트를 내보낸 뒤의 실패는 폴백하지 않는다(중복 출력 방지) — 오류로 끝낸다.
 */

const MAX_ATTEMPTS = 3;

const cooldownUntil = new Map<number, number>();
/** 항목 id → 마지막으로 알린 오류 서명. 같은 사건(같은 오류)은 한 번만, **오류 종류가 바뀌면 다시** 알린다 —
 *  404(모델) → 429(쿼터) → 400(설정) 처럼 원인이 바뀌었는데 억제되면 문제 파악이 안 된다 (실사례) */
const notifiedDown = new Map<number, string>();
/** 직전에 어느 항목으로 말했는가 — "주 공급자로 돌아왔다" 판정 근거 */
let servingId: number | null = null;

function cooldownMinutes(status: number | null): number {
  if (status === 401 || status === 403) return 30; // 키 문제 — 사람이 고쳐야 풀린다
  if (status === 429) return 5; // 쿼터 — 곧 풀린다
  return 2; // 장애·네트워크
}

function adapterFor(entry: AgentProvider): ProviderAdapter {
  switch (entry.kind) {
    case 'OPENAI':
      return new OpenAiAdapter(entry.apiKey, entry.model);
    case 'GEMINI':
      return new GeminiAdapter(entry.apiKey, entry.model);
    case 'OPENAI_COMPAT':
      return new OpenAiCompatAdapter(entry.apiKey, entry.baseUrl ?? '', entry.model);
    default:
      return new AnthropicAdapter(entry.apiKey, entry.model);
  }
}

function isCooling(entry: AgentProvider): boolean {
  const until = cooldownUntil.get(entry.id);
  return until !== undefined && until > Date.now();
}

function notifyFailover(prisma: PrismaClient, failed: AgentProvider, next: AgentProvider | null, message: string, signature: string) {
  if (notifiedDown.get(failed.id) === signature) return;
  notifiedDown.set(failed.id, signature);
  void notifyService.notifyAdmins(prisma, 'ERROR', {
    title: `에이전트 프로바이더 장애: ${failed.name}`,
    lines: [message ? `오류: ${message.slice(0, 300)}` : null, next ? `다음 순위(${next.name})로 이어받았습니다.` : '남은 항목이 없어 응답에 실패했습니다.'],
    fields: [
      { name: '항목', value: `${failed.name} (${failed.kind} · ${failed.model})` },
      next ? { name: '이어받음', value: next.name } : null,
      { name: '오류', value: message.slice(0, 500) || '(없음)' },
    ],
  });
}

function notifyRecovery(prisma: PrismaClient, primary: AgentProvider) {
  void notifyService.notifyAdmins(prisma, 'ERROR', {
    title: `에이전트 프로바이더 복귀: ${primary.name}`,
    lines: ['1순위 프로바이더가 다시 응답합니다.'],
    fields: [{ name: '항목', value: `${primary.name} (${primary.kind} · ${primary.model})` }],
  });
}

export async function runWithFallback(
  prisma: PrismaClient,
  providers: AgentProvider[],
  request: TurnRequest,
): Promise<{ outcome: TurnOutcome; served: AgentProvider }> {
  const awake = providers.filter((entry) => !isCooling(entry));
  //  전부 쉬고 있으면 그래도 1순위 (위 ⚠)
  const attempts = (awake.length > 0 ? awake : providers).slice(0, MAX_ATTEMPTS);

  let lastError: unknown = null;
  for (const [index, entry] of attempts.entries()) {
    try {
      if (request.signal.aborted) throw new Error('aborted');
      const resolved = await adapterFor(entry).runTurn(request);

      //  성공 — 쉬는 표시·사건 표시를 걷는다. 1순위가 아니던 항목이 1순위로 돌아왔으면 복귀 알림
      cooldownUntil.delete(entry.id);
      notifiedDown.delete(entry.id);
      if (entry.id === providers[0]?.id && servingId !== null && servingId !== entry.id) {
        notifyRecovery(prisma, entry);
      }
      servingId = entry.id;
      return { outcome: resolved, served: entry };
    } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderApiError)) throw error; // tool 오류·abort 는 폴백 대상이 아니다
      console.error(`[agent] 프로바이더 실패 (${entry.name}):`, error.status, error.message);
      cooldownUntil.set(entry.id, Date.now() + cooldownMinutes(error.status) * 60_000);
      const signature = String(error.status ?? 'network');
      if (error.emittedText) {
        //  이미 출력이 나갔다 — 이어붙이면 중복이라 폴백하지 않지만, 운영자는 알아야 한다
        notifyFailover(prisma, entry, null, `(응답 도중 실패 — 폴백 불가) ${error.message}`, signature);
        throw error;
      }
      notifyFailover(prisma, entry, attempts[index + 1] ?? null, error.message, signature);
    }
  }
  throw lastError ?? new Error('사용할 수 있는 프로바이더가 없습니다.');
}

/** 승인 카드로 멈춘 턴 재개 — native 상태가 어댑터별이라 **같은 항목으로만** 간다 (폴백 없음) */
export function resumePendingTurn(
  provider: AgentProvider,
  native: unknown,
  resolved: ResolvedTool,
  request: TurnRequest,
): Promise<TurnOutcome> {
  return adapterFor(provider).resumeTurn(native, resolved, request);
}

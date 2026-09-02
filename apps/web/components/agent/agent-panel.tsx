'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, SendHorizonal, ShieldQuestion, Sparkles, Trash2, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import Markdown from '@/components/custom/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 위즈봇 에이전트 패널 (#35). 콘솔 우측 채팅창 — 스트리밍 응답, tool 표시,
 * 파괴적 작업의 승인 카드(pelican tool_confirmation). 대화는 서버(DB)에 저장돼 어디서든 이어진다.
 */

type ActionStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

type DisplayItem =
  | { kind: 'text'; role: 'user' | 'assistant'; text: string }
  | { kind: 'tool'; name: string; toolUseId?: string }
  | { kind: 'card'; actionId: number; toolUseId: string; tool: string; title: string; lines: string[]; status: ActionStatus };

interface ActionRow {
  id: number;
  toolUseId: string;
  tool: string;
  status: ActionStatus;
  cardJson: string;
}

const TOOL_LABEL: Record<string, string> = {
  list_commands: '명령어 목록 조회',
  list_repeats: '반복 메시지 조회',
  get_playback: '플레이어 상태 조회',
  list_favorites: '즐겨찾기 목록 조회',
  get_favorite: '즐겨찾기 내용 조회',
  list_shortcuts: '링크 목록 조회',
  get_user_setting: '계정 설정 조회',
  search_audit_log: '변경 기록 조회',
  list_available_functions: '기능 카탈로그 조회',
  create_echo_command: '명령어 추가',
  update_echo_command: '명령어 수정',
  create_function_command: '기능 명령어 추가',
  update_function_command: '기능 명령어 수정',
  set_command_enabled: '명령어 켬/끔',
  delete_command: '명령어 삭제',
  create_repeat: '반복 메시지 추가',
  update_repeat: '반복 메시지 수정',
  set_repeat_enabled: '반복 메시지 켬/끔',
  delete_repeat: '반복 메시지 삭제',
  create_shortcut: '링크 추가',
  update_shortcut: '링크 수정',
  delete_shortcut: '링크 삭제',
  add_song: '곡 추가',
  control_playback: '재생 제어',
  set_volume: '볼륨 변경',
  clear_queue: '대기열 비우기',
  enqueue_favorite: '즐겨찾기 재생',
  import_playlist: '재생목록 가져오기',
  create_inquiry: '문의 작성',
  web_search: '웹 검색',
};

const STATUS_BADGE: Record<Exclude<ActionStatus, 'PENDING'>, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  APPROVED: { label: '승인됨', variant: 'default' },
  DECLINED: { label: '거절됨', variant: 'secondary' },
  EXPIRED: { label: '만료됨', variant: 'outline' },
};

/** DB 에 저장된 content 블록 → 화면 아이템 (tool_result·thinking 은 숨긴다) */
function blocksToItems(role: string, content: unknown): DisplayItem[] {
  if (typeof content === 'string') {
    return content && role !== 'system' ? [{ kind: 'text', role: role === 'user' ? 'user' : 'assistant', text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const items: DisplayItem[] = [];
  for (const block of content as { type?: string; text?: string; name?: string; id?: string }[]) {
    if (block.type === 'text' && block.text) {
      items.push({ kind: 'text', role: role === 'user' ? 'user' : 'assistant', text: block.text });
    } else if (block.type === 'tool_use' && block.name) {
      items.push({ kind: 'tool', name: block.name, toolUseId: block.id });
    } else if (block.type === 'web_search') {
      items.push({ kind: 'tool', name: 'web_search' });
    }
  }
  return items;
}

export function AgentPanel() {
  const trpc = useTRPC();
  const { data: status } = useQuery(trpc.agent.status.queryOptions());
  const [open, setOpen] = useState(false);

  if (!status?.enabled) return null;

  if (!open) {
    return (
      <Button
        size="icon"
        className="fixed bottom-24 right-4 z-40 size-12 rounded-full shadow-lg"
        aria-label="에이전트 열기"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-5" />
      </Button>
    );
  }
  return <PanelBody allowDelete={status.allowDelete} onClose={() => setOpen(false)} />;
}

function PanelBody({ allowDelete, onClose }: { allowDelete: boolean; onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: conversations } = useQuery(trpc.agent.conversations.queryOptions());
  const createConversation = useMutation(trpc.agent.createConversation.mutationOptions());
  const deleteConversation = useMutation(trpc.agent.deleteConversation.mutationOptions());

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  //  스트리밍 중에는 서버 기록 조회를 멈춘다 — focus 재조회가 live 턴과 겹쳐 두 번 보인다
  const { data: conversation } = useQuery({
    ...trpc.agent.conversation.queryOptions({ id: conversationId ?? 0 }),
    enabled: conversationId !== null && !streaming,
  });
  const { data: actions } = useQuery({
    ...trpc.agent.actions.queryOptions({ conversationId: conversationId ?? 0 }),
    enabled: conversationId !== null,
  });
  const actionByToolUse = new Map((actions ?? []).map((row) => [row.toolUseId, row]));

  //  이번 세션에서 주고받은 턴 — 서버 기록과 이어 붙여 그린다. 대화를 바꾸면 비운다 (#200 패턴)
  const [live, setLive] = useState<DisplayItem[]>([]);
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    setLive([]);
  }

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const historyItems = (conversation?.messages ?? []).flatMap((row) => {
    try {
      return blocksToItems(row.role, JSON.parse(row.contentJson) as unknown);
    } catch {
      return [];
    }
  });
  //  live 카드와 서버 액션이 겹치면 live 쪽(방금 상태)을 그린다
  const liveCardIds = new Set(live.filter((item): item is Extract<DisplayItem, { kind: 'card' }> => item.kind === 'card').map((item) => item.toolUseId));
  const items = [...historyItems.filter((item) => !(item.kind === 'tool' && item.toolUseId && liveCardIds.has(item.toolUseId))), ...live];

  const itemCount = items.length;
  const lastText = items[items.length - 1]?.kind === 'text' ? (items[items.length - 1] as { text: string }).text : '';
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [itemCount, lastText]);

  /** SSE 본문을 읽어 live 에 반영 — 채팅과 카드 재개가 같은 규약을 쓴다 */
  async function consumeStream(response: Response) {
    if (!response.ok || !response.body) {
      const failed = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(failed?.message ?? '요청에 실패했습니다.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantOpen = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const eventName = /^event: (.+)$/m.exec(chunk)?.[1];
        const dataLine = /^data: (.+)$/m.exec(chunk)?.[1];
        if (!eventName || !dataLine) continue;
        const data = JSON.parse(dataLine) as {
          delta?: string; name?: string; message?: string;
          actionId?: number; toolUseId?: string; tool?: string; card?: { title: string; lines: string[] };
        };
        if (eventName === 'text' && data.delta) {
          const delta = data.delta;
          if (!assistantOpen) {
            assistantOpen = true;
            setLive((prev) => [...prev, { kind: 'text', role: 'assistant', text: delta }]);
          } else {
            setLive((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.kind === 'text' && last.role === 'assistant') {
                next[next.length - 1] = { ...last, text: last.text + delta };
              }
              return next;
            });
          }
        } else if (eventName === 'tool' && data.name) {
          assistantOpen = false;
          setLive((prev) => [...prev, { kind: 'tool', name: data.name! }]);
        } else if (eventName === 'confirm' && data.actionId && data.card) {
          assistantOpen = false;
          setLive((prev) => [
            ...prev,
            {
              kind: 'card',
              actionId: data.actionId!,
              toolUseId: data.toolUseId ?? '',
              tool: data.tool ?? '',
              title: data.card!.title,
              lines: data.card!.lines,
              status: 'PENDING',
            },
          ]);
        } else if (eventName === 'error') {
          throw new Error(data.message ?? '응답 생성에 실패했습니다.');
        }
      }
    }
  }

  /** 스트림 종료 후 서버 기록으로 동기화하고 live 를 비운다 — focus 재조회가 와도 중복이 없다 */
  async function syncAfterStream(id: number | null) {
    if (id !== null) {
      await queryClient.fetchQuery(trpc.agent.conversation.queryOptions({ id })).catch(() => {});
      await queryClient.invalidateQueries(trpc.agent.actions.queryFilter({ conversationId: id })).catch(() => {});
    }
    setLive([]);
  }

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput('');
    setStreaming(true);
    let id = conversationId;

    try {
      if (id === null) {
        const created = await createConversation.mutateAsync();
        id = created.id;
        setPrevConversationId(id);
        setConversationId(id);
        void queryClient.invalidateQueries(trpc.agent.conversations.queryFilter());
      }
      setLive((prev) => [...prev, { kind: 'text', role: 'user', text: message }]);
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: id, message }),
      });
      await consumeStream(response);
      void queryClient.invalidateQueries(trpc.agent.conversations.queryFilter());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      await syncAfterStream(id);
      setStreaming(false);
    }
  }

  /** 승인 카드 응답 — 승인이면 서버가 실행하고 멈췄던 턴이 이어진다 */
  async function resolveCard(actionId: number, approve: boolean) {
    if (streaming) return;
    setStreaming(true);
    const nextStatus: ActionStatus = approve ? 'APPROVED' : 'DECLINED';
    setLive((prev) => prev.map((item) => (item.kind === 'card' && item.actionId === actionId ? { ...item, status: nextStatus } : item)));

    try {
      const response = await fetch('/api/agent/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId, approve }),
      });
      await consumeStream(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      await syncAfterStream(conversationId);
      setStreaming(false);
    }
  }

  function selectConversation(id: number | null) {
    if (streaming) return;
    setConversationId(id);
    if (id !== null) void queryClient.invalidateQueries(trpc.agent.conversation.queryFilter({ id }));
  }

  function removeConversation(id: number) {
    deleteConversation.mutate(
      { id },
      {
        onSuccess: () => {
          if (conversationId === id) selectConversation(null);
          void queryClient.invalidateQueries(trpc.agent.conversations.queryFilter());
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  function renderItem(item: DisplayItem, index: number) {
    if (item.kind === 'card') {
      return <ConfirmCard key={`card-${item.actionId}`} card={item} disabled={streaming} onResolve={resolveCard} />;
    }
    if (item.kind === 'tool') {
      //  승인 카드가 있는 tool_use 는 카드로 그린다 (기록에서 다시 열었을 때)
      const action = item.toolUseId ? actionByToolUse.get(item.toolUseId) : undefined;
      if (action) {
        let card: { title: string; lines: string[] };
        try {
          card = JSON.parse(action.cardJson) as { title: string; lines: string[] };
        } catch {
          card = { title: TOOL_LABEL[action.tool] ?? action.tool, lines: [] };
        }
        return (
          <ConfirmCard
            key={`card-${action.id}`}
            card={{ kind: 'card', actionId: action.id, toolUseId: action.toolUseId, tool: action.tool, title: card.title, lines: card.lines, status: action.status }}
            disabled={streaming}
            onResolve={resolveCard}
          />
        );
      }
      return (
        <div key={index} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wrench className="size-3" /> {TOOL_LABEL[item.name] ?? item.name}
        </div>
      );
    }
    if (item.role === 'user') {
      return (
        <div key={index} className="ml-8 self-end rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {item.text}
        </div>
      );
    }
    return (
      <div key={index} className="prose prose-sm dark:prose-invert max-w-none text-sm">
        <Markdown>{item.text}</Markdown>
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[380px] max-w-[95vw] flex-col border-l bg-background shadow-xl">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="size-4 shrink-0" />
          <span className="truncate text-sm font-medium">위즈봇 에이전트</span>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={streaming}>
                대화 <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-72">
              {(conversations ?? []).map((row) => (
                <DropdownMenuItem key={row.id} onSelect={() => selectConversation(row.id)}>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  {allowDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 shrink-0"
                      aria-label="대화 삭제"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeConversation(row.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </DropdownMenuItem>
              ))}
              {!conversations?.length && <DropdownMenuItem disabled>대화가 없습니다</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="icon" variant="ghost" className="size-8" aria-label="새 대화" disabled={streaming} onClick={() => selectConversation(null)}>
            <Plus className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-8" aria-label="닫기" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Sparkles className="size-6" />
            <p>
              위즈봇 설정을 대신 확인하고 바꿔드립니다.
              <br />
              예: &ldquo;내 명령어 목록 보여줘&rdquo;, &ldquo;대기열 비워줘&rdquo;
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, index) => renderItem(item, index))}
            {streaming && <div className="text-xs text-muted-foreground">생각 중…</div>}
          </div>
        )}
      </div>

      <form
        className="flex shrink-0 items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="무엇이든 물어보세요"
          rows={1}
          className="max-h-32 min-h-9 flex-1 resize-none"
        />
        <Button type="submit" size="icon" className="size-9 shrink-0" disabled={streaming || !input.trim()} aria-label="보내기">
          <SendHorizonal className="size-4" />
        </Button>
      </form>
    </div>
  );
}

/** 승인 카드 — 실행 경로는 이 버튼뿐이다. 모델은 카드를 띄울 수만 있다 */
function ConfirmCard({
  card,
  disabled,
  onResolve,
}: {
  card: Extract<DisplayItem, { kind: 'card' }>;
  disabled: boolean;
  onResolve: (actionId: number, approve: boolean) => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldQuestion className="size-4" /> {card.title}
        </div>
        {card.status !== 'PENDING' && <Badge variant={STATUS_BADGE[card.status].variant}>{STATUS_BADGE[card.status].label}</Badge>}
      </div>
      {card.lines.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted-foreground">
          {card.lines.map((line, index) => (
            <p key={index} className="whitespace-pre-wrap">{line}</p>
          ))}
        </div>
      )}
      {card.status === 'PENDING' && (
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onResolve(card.actionId, false)}>
            거절
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => onResolve(card.actionId, true)}>
            승인
          </Button>
        </div>
      )}
    </div>
  );
}

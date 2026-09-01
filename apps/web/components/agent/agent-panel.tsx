'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, SendHorizonal, Sparkles, Trash2, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import Markdown from '@/components/custom/markdown';
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
 * 설정 도우미 에이전트 패널 (#35 PR1). 콘솔 우측에 뜨는 채팅창 —
 * 스트리밍 응답과 tool 조회 표시. 대화는 서버(DB)에 저장돼 어디서든 이어진다.
 */

type DisplayItem =
  | { kind: 'text'; role: 'user' | 'assistant'; text: string }
  | { kind: 'tool'; name: string };

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
};

/** DB 에 저장된 Anthropic content 블록 → 화면 아이템 (tool_result·thinking 은 숨긴다) */
function blocksToItems(role: string, content: unknown): DisplayItem[] {
  if (typeof content === 'string') {
    return content && role !== 'system' ? [{ kind: 'text', role: role === 'user' ? 'user' : 'assistant', text: content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const items: DisplayItem[] = [];
  for (const block of content as { type?: string; text?: string; name?: string }[]) {
    if (block.type === 'text' && block.text) {
      items.push({ kind: 'text', role: role === 'user' ? 'user' : 'assistant', text: block.text });
    } else if (block.type === 'tool_use' && block.name) {
      items.push({ kind: 'tool', name: block.name });
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
        aria-label="도우미 열기"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-5" />
      </Button>
    );
  }
  return <PanelBody onClose={() => setOpen(false)} />;
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: conversations } = useQuery(trpc.agent.conversations.queryOptions());
  const createConversation = useMutation(trpc.agent.createConversation.mutationOptions());
  const deleteConversation = useMutation(trpc.agent.deleteConversation.mutationOptions());

  const [conversationId, setConversationId] = useState<number | null>(null);
  const { data: conversation } = useQuery({
    ...trpc.agent.conversation.queryOptions({ id: conversationId ?? 0 }),
    enabled: conversationId !== null,
  });

  //  이번 세션에서 주고받은 턴 — 서버 기록(conversation)과 이어 붙여 그린다.
  //  대화를 바꾸면 비운다 (렌더 중 보정, #200 패턴)
  const [live, setLive] = useState<DisplayItem[]>([]);
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (conversationId !== prevConversationId) {
    setPrevConversationId(conversationId);
    setLive([]);
  }

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const historyItems = (conversation?.messages ?? []).flatMap((row) => {
    try {
      return blocksToItems(row.role, JSON.parse(row.contentJson) as unknown);
    } catch {
      return [];
    }
  });
  const items = [...historyItems, ...live];

  //  새 내용이 붙으면 맨 아래로
  const itemCount = items.length;
  const lastText = items[items.length - 1]?.kind === 'text' ? (items[items.length - 1] as { text: string }).text : '';
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [itemCount, lastText]);

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput('');
    setStreaming(true);

    try {
      let id = conversationId;
      if (id === null) {
        const created = await createConversation.mutateAsync();
        id = created.id;
        //  방금 만든 대화는 기록이 비어 있으니 live 만으로 그려진다
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
          const data = JSON.parse(dataLine) as { delta?: string; name?: string; message?: string };
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
          } else if (eventName === 'error') {
            throw new Error(data.message ?? '응답 생성에 실패했습니다.');
          }
        }
      }
      void queryClient.invalidateQueries(trpc.agent.conversations.queryFilter());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setStreaming(false);
    }
  }

  function selectConversation(id: number | null) {
    if (streaming) return;
    setConversationId(id);
    if (id !== null) void queryClient.invalidateQueries(trpc.agent.conversation.queryFilter({ id }));
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[380px] max-w-[95vw] flex-col border-l bg-background shadow-xl">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="size-4 shrink-0" />
          <span className="truncate text-sm font-medium">위즈봇 도우미</span>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" disabled={streaming}>
                대화 <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              {(conversations ?? []).map((row) => (
                <DropdownMenuItem key={row.id} onSelect={() => selectConversation(row.id)}>
                  <span className="truncate">{row.title}</span>
                </DropdownMenuItem>
              ))}
              {!conversations?.length && <DropdownMenuItem disabled>대화가 없습니다</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="icon" variant="ghost" className="size-8" aria-label="새 대화" disabled={streaming} onClick={() => selectConversation(null)}>
            <Plus className="size-4" />
          </Button>
          {conversationId !== null && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="대화 삭제"
              disabled={streaming}
              onClick={() => {
                const id = conversationId;
                selectConversation(null);
                deleteConversation.mutate({ id }, {
                  onSuccess: () => void queryClient.invalidateQueries(trpc.agent.conversations.queryFilter()),
                });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
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
              위즈봇 설정을 대신 확인해드립니다.
              <br />
              예: &ldquo;내 명령어 목록 보여줘&rdquo;, &ldquo;대기열에 뭐 있어?&rdquo;
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, index) =>
              item.kind === 'tool' ? (
                <div key={index} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wrench className="size-3" /> {TOOL_LABEL[item.name] ?? item.name}
                </div>
              ) : item.role === 'user' ? (
                <div key={index} className="ml-8 self-end rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                  {item.text}
                </div>
              ) : (
                <div key={index} className="prose prose-sm dark:prose-invert max-w-none text-sm">
                  <Markdown>{item.text}</Markdown>
                </div>
              ),
            )}
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

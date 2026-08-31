import Markdown from '@/components/custom/markdown';
import { cn } from '@/lib/utils';

export type ThreadMessage = { id: number; author: 'STREAMER' | 'ADMIN'; body: string; createdAt: string | Date };

/**
 * 문의 스레드 (#206 3/3) — 스트리머·어드민 화면이 공유한다.
 * viewer 기준으로 내 메시지는 오른쪽 파란 톤, 상대는 왼쪽 카드 톤.
 */
export function MessageThread({ messages, viewer }: { messages: ThreadMessage[]; viewer: 'STREAMER' | 'ADMIN' }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => {
        const mine = message.author === viewer;
        return (
          <div key={message.id} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
            <span className="text-xs text-muted-foreground">
              {message.author === 'ADMIN' ? '관리자' : '스트리머'} · {new Date(message.createdAt).toLocaleString('ko-KR')}
            </span>
            <div className={cn('max-w-[85%] rounded-lg border px-4 py-3 text-sm', mine ? 'bg-primary/5 border-primary/30' : 'bg-card')}>
              <Markdown>{message.body}</Markdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}

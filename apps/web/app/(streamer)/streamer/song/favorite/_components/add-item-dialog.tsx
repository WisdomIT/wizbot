'use client';

import { useQuery } from '@tanstack/react-query';
import { ListPlus, Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { formatTime } from '@/components/song/song-player';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 곡·재생목록 추가 (#97).
 * 입력한 것이 어떤 영상/재생목록인지 확인한 뒤 담는다 —
 * 검색어로 담을 때 엉뚱한 영상이 들어가는 것을 막는다.
 */
export function AddItemDialog({
  mode,
  pending,
  onConfirm,
}: {
  mode: 'video' | 'playlist';
  pending: boolean;
  onConfirm: (input: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  /** 「확인」을 누른 시점의 값 — 입력할 때마다 유튜브를 조회하지 않는다 */
  const [checking, setChecking] = useState('');

  const close = () => {
    setOpen(false);
    setInput('');
    setChecking('');
  };

  const isVideo = mode === 'video';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={isVideo ? 'default' : 'outline'}>
          {isVideo ? <Plus /> : <ListPlus />}
          {isVideo ? '곡 추가' : '재생목록 가져오기'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isVideo ? '곡 추가' : '재생목록 가져오기'}</DialogTitle>
          <DialogDescription>
            {isVideo
              ? '검색어나 유튜브 영상 주소를 입력하고, 어떤 영상인지 확인한 뒤 담습니다.'
              : '유튜브 재생목록 주소를 입력하고, 어떤 목록인지 확인한 뒤 가져옵니다. 한 번에 최대 200곡까지 담깁니다.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim()) setChecking(input.trim());
          }}
        >
          <Input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setChecking('');
            }}
            placeholder={isVideo ? '검색어 또는 유튜브 영상 주소' : '…/playlist?list=…'}
          />
          <Button type="submit" variant="outline" disabled={!input.trim()}>
            <Search /> 확인
          </Button>
        </form>

        {checking &&
          (isVideo ? (
            <VideoPreview query={checking} />
          ) : (
            <PlaylistPreview url={checking} />
          ))}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            취소
          </Button>
          <Button
            disabled={!checking || pending}
            onClick={() => {
              onConfirm(checking);
              close();
            }}
          >
            {isVideo ? '담기' : '가져오기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border p-3 text-sm">{children}</div>;
}

function VideoPreview({ query }: { query: string }) {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery(
    trpc.songFavorite.previewItem.queryOptions({ query }),
  );

  if (isPending) return <Skeleton className="h-20 w-full" />;
  if (error) return <PreviewFrame>{error.message}</PreviewFrame>;

  return (
    <PreviewFrame>
      <div className="flex items-center gap-3">
        {/* 유튜브 CDN 썸네일 — 다른 원격 이미지와 같은 방식 */}
        <img
          src={`https://i.ytimg.com/vi/${data.youtubeId}/mqdefault.jpg`}
          alt=""
          className="h-14 w-24 shrink-0 rounded object-cover"
        />
        <div className="flex min-w-0 flex-col">
          <span className="font-medium break-words">{data.title}</span>
          <span className="text-xs text-muted-foreground">
            {data.uploader} · {formatTime(data.durationSeconds)}
          </span>
        </div>
      </div>
    </PreviewFrame>
  );
}

function PlaylistPreview({ url }: { url: string }) {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery(
    trpc.songFavorite.previewPlaylist.queryOptions({ url }),
  );

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (error) return <PreviewFrame>{error.message}</PreviewFrame>;

  return (
    <PreviewFrame>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col">
          <span className="font-medium break-words">{data.title}</span>
          <span className="text-xs text-muted-foreground">
            {data.total}곡{data.truncated && ' (상한까지만 가져옵니다)'} · 이미 담긴 곡은
            제외됩니다
          </span>
        </div>
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {data.videos.map((video) => (
            <li key={video.youtubeId} className="break-words">
              · {video.title}
            </li>
          ))}
          {data.total > data.videos.length && <li>… 외 {data.total - data.videos.length}곡</li>}
        </ul>
      </div>
    </PreviewFrame>
  );
}

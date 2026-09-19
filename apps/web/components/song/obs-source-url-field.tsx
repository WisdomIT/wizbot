'use client';

import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/**
 * OBS 브라우저 소스 주소 한 줄 — 가려진 입력칸 + 보기/복사/재발급(확인 포함) (#322 #326).
 * 노래 설정 모달과 에이전트 패널 카드가 같은 것을 쓴다. 주소는 방송 화면에 그대로 찍힐 수 있으므로 기본은 가려둔다
 */
export function ObsSourceUrlField({ token, onRegenerate }: { token: string | null; onRegenerate: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [origin, setOrigin] = useState('');
  useState(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  });
  const playerUrl = token ? `${origin}/obs/${token}/player` : '';

  return (
    <>
      <div className="flex items-center gap-1">
        <Input readOnly value={playerUrl} type={revealed ? 'text' : 'password'} className="font-mono text-xs" />
        <Button variant="outline" size="icon" aria-label={revealed ? '주소 가리기' : '주소 보기'} title={revealed ? '주소 가리기' : '주소 보기'} onClick={() => setRevealed((prev) => !prev)}>
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="주소 복사"
          title="주소 복사"
          disabled={!playerUrl}
          onClick={() => {
            void navigator.clipboard.writeText(playerUrl);
            toast.success('주소를 복사했습니다.');
          }}
        >
          <Copy />
        </Button>
        <Button variant="outline" size="icon" aria-label="주소 재발급" title="주소 재발급" onClick={() => setConfirming(true)}>
          <RefreshCw />
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>주소를 새로 발급할까요?</DialogTitle>
            <DialogDescription>
              새 주소가 발급되면 <strong>기존 주소는 즉시 사용할 수 없게 됩니다.</strong> 이미 OBS 에 등록해 둔 브라우저 소스는 재생이 멈추므로, 새 주소를 다시 붙여넣어야 합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                setRevealed(false);
                onRegenerate();
              }}
            >
              새로 발급
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

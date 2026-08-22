'use client';

import { Copy, Eye, EyeOff, RefreshCw, Settings } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

export interface SongSettings {
  sourceType: 'NONE' | 'OBS' | 'ELECTRON';
  sourceToken: string | null;
  overlay: { mode: 'ALWAYS' | 'TIMED'; durationSeconds: number };
  autoPlay: boolean;
  historyPublic: boolean;
}

/** 노래 기능 설정 — 흩어져 있던 설정을 한 곳에 모은다 (#97) */
export function SettingsDialog({
  settings,
  onChangeSourceType,
  onRegenerate,
  onChangeOverlay,
  onChangeAutoPlay,
  onChangeHistoryPublic,
}: {
  settings: SongSettings;
  onChangeSourceType: (sourceType: SongSettings['sourceType']) => void;
  onRegenerate: () => void;
  onChangeOverlay: (overlay: SongSettings['overlay']) => void;
  onChangeAutoPlay: (enabled: boolean) => void;
  onChangeHistoryPublic: (isPublic: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="설정" title="설정">
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>노래 설정</DialogTitle>
          <DialogDescription>
            송출 소스와 자막, 자동 재생, 시청자 공개를 여기에서 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <SourceSection
            settings={settings}
            onChangeSourceType={onChangeSourceType}
            onRegenerate={onRegenerate}
          />
          <Separator />
          <OverlaySection overlay={settings.overlay} onChange={onChangeOverlay} />
          <Separator />

          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <Label htmlFor="setting-autoplay">자동 재생</Label>
                <span className="text-xs text-muted-foreground">
                  대기열이 비면 대표 즐겨찾기에서 한 곡을 골라 이어서 재생합니다.
                </span>
              </div>
              <Switch
                id="setting-autoplay"
                checked={settings.autoPlay}
                onCheckedChange={onChangeAutoPlay}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <Label htmlFor="setting-history">재생 기록 공개</Label>
                <span className="text-xs text-muted-foreground">
                  시청자용 재생 기록 페이지에 목록을 공개합니다. 개별 곡은 따로 숨길 수 있습니다.
                </span>
              </div>
              <Switch
                id="setting-history"
                checked={settings.historyPublic}
                onCheckedChange={onChangeHistoryPublic}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceSection({
  settings,
  onChangeSourceType,
  onRegenerate,
}: {
  settings: SongSettings;
  onChangeSourceType: (sourceType: SongSettings['sourceType']) => void;
  onRegenerate: () => void;
}) {
  // 주소는 방송 화면에 그대로 찍힐 수 있으므로 기본은 가려둔다
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [origin, setOrigin] = useState('');
  useState(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  });

  const playerUrl = settings.sourceToken ? `${origin}/obs/${settings.sourceToken}/player` : '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label>송출 소스</Label>
        <Select
          value={settings.sourceType}
          onValueChange={(value) => onChangeSourceType(value as SongSettings['sourceType'])}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OBS">OBS 브라우저 소스</SelectItem>
            <SelectItem value="ELECTRON">위즈봇 플레이어 앱</SelectItem>
            <SelectItem value="NONE">사용 안 함</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {settings.sourceType === 'OBS' && (
        <div className="flex flex-col gap-2">
          <Label>브라우저 소스 주소</Label>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={playerUrl}
              type={revealed ? 'text' : 'password'}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={revealed ? '주소 가리기' : '주소 보기'}
              title={revealed ? '주소 가리기' : '주소 보기'}
              onClick={() => setRevealed((prev) => !prev)}
            >
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="주소 복사"
              title="주소 복사"
              onClick={() => {
                void navigator.clipboard.writeText(playerUrl);
                toast.success('주소를 복사했습니다.');
              }}
            >
              <Copy />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="주소 재발급"
              title="주소 재발급"
              onClick={() => setConfirming(true)}
            >
              <RefreshCw />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            이 주소를 아는 사람은 재생 상태를 볼 수 있습니다. 방송 화면에 노출됐다면 재발급하세요.
          </p>
          <p className="text-xs text-muted-foreground">
            💡 유튜브 프리미엄 계정이 있다면, OBS 에서 브라우저 소스를 하나 더 만들어 주소를{' '}
            <code className="font-mono">https://www.youtube.com</code> 으로 두고 [상호작용] 창에서
            로그인해두면 광고 없이 재생됩니다.
          </p>

          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>주소를 새로 발급할까요?</DialogTitle>
                <DialogDescription>
                  새 주소가 발급되면 <strong>기존 주소는 즉시 사용할 수 없게 됩니다.</strong> 이미
                  OBS 에 등록해 둔 브라우저 소스는 재생이 멈추므로, 새 주소를 다시 붙여넣어야
                  합니다.
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
        </div>
      )}
    </div>
  );
}

function OverlaySection({
  overlay,
  onChange,
}: {
  overlay: SongSettings['overlay'];
  onChange: (overlay: SongSettings['overlay']) => void;
}) {
  const [seconds, setSeconds] = useState(String(overlay.durationSeconds));

  return (
    <div className="flex flex-col gap-2">
      <Label>자막</Label>
      <span className="text-xs text-muted-foreground">
        송출 화면에 현재 곡 제목이 표시됩니다. 글자 크기는 브라우저 소스 높이에 맞춰 조절되고(최대
        120px), 제목이 길면 옆으로 흐릅니다.
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={overlay.mode}
          onValueChange={(mode) =>
            onChange({ mode: mode as 'ALWAYS' | 'TIMED', durationSeconds: overlay.durationSeconds })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALWAYS">항상 표시</SelectItem>
            <SelectItem value="TIMED">곡이 바뀔 때만 잠시 표시</SelectItem>
          </SelectContent>
        </Select>

        {overlay.mode === 'TIMED' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={60}
              value={seconds}
              className="w-20"
              onChange={(event) => setSeconds(event.target.value)}
              onBlur={() => {
                const durationSeconds = Number(seconds);
                if (
                  !Number.isFinite(durationSeconds) ||
                  durationSeconds < 1 ||
                  durationSeconds > 60
                ) {
                  setSeconds(String(overlay.durationSeconds));
                  return;
                }
                if (durationSeconds !== overlay.durationSeconds) {
                  onChange({ mode: overlay.mode, durationSeconds });
                }
              }}
            />
            <span className="text-sm text-muted-foreground">초 동안 표시</span>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { Copy, Eye, EyeOff, LogOut, RefreshCw, Settings, Youtube } from 'lucide-react';
import { useTheme } from 'next-themes';
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

import { ShortcutInput } from './shortcut-input';

export interface SongSettings {
  sourceType: 'NONE' | 'OBS' | 'ELECTRON';
  sourceToken: string | null;
  overlay: { mode: 'ALWAYS' | 'TIMED'; durationSeconds: number };
  autoPlay: boolean;
  historyPublic: boolean;
  keyboardShortcut: boolean;
  shortcuts: { playPause: string; stop: string; next: string };
}

/** 데스크톱 앱이 등록하는 전역 단축키 (#85) */
const SHORTCUT_ACTIONS = [
  { key: 'playPause', label: '재생 / 일시정지' },
  { key: 'stop', label: '정지' },
  { key: 'next', label: '다음 곡' },
] as const;

/** 노래 기능 설정 — 흩어져 있던 설정을 한 곳에 모은다 (#97) */
export function SettingsDialog({
  settings,
  onChangeSourceType,
  onRegenerate,
  onChangeOverlay,
  onChangeAutoPlay,
  onChangeHistoryPublic,
  onChangeKeyboardShortcut,
  onChangeShortcuts,
  autoLaunch,
  youtube,
  isApp = false,
}: {
  settings: SongSettings;
  onChangeSourceType: (sourceType: SongSettings['sourceType']) => void;
  onRegenerate: () => void;
  onChangeOverlay: (overlay: SongSettings['overlay']) => void;
  onChangeAutoPlay: (enabled: boolean) => void;
  onChangeHistoryPublic: (isPublic: boolean) => void;
  onChangeKeyboardShortcut: (enabled: boolean) => void;
  onChangeShortcuts: (shortcuts: SongSettings['shortcuts']) => void;
  /** 데스크톱 앱에서 열었을 때만 — 계정이 아니라 이 기기의 설정이다 */
  autoLaunch?: { enabled: boolean; onChange: (enabled: boolean) => void };
  /** 데스크톱 앱에서만 — 유튜브 로그인은 앱이 띄우는 별도 창에서 한다 */
  youtube?: { loggedIn: boolean; login: () => void; logout: () => void };
  /** 전역 단축키·화면 테마·로그아웃은 앱 전용 설정이라 앱에서만 보인다 (#202) */
  isApp?: boolean;
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

          {youtube && (
            <>
              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <Label>유튜브 로그인</Label>
                  <span className="text-xs text-muted-foreground">
                    {youtube.loggedIn
                      ? '로그인되어 있습니다. 프리미엄 계정이면 광고 없이 재생됩니다.'
                      : '프리미엄 계정으로 로그인하면 광고 없이 재생됩니다. 별도 창이 열립니다.'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" onClick={youtube.login}>
                    <Youtube /> {youtube.loggedIn ? '유튜브 열기' : '로그인'}
                  </Button>
                  {youtube.loggedIn && (
                    <Button variant="ghost" className="text-destructive" onClick={youtube.logout}>
                      로그아웃
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {autoLaunch && (
            <>
              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <Label htmlFor="setting-autolaunch">컴퓨터 시작 시 자동 실행</Label>
                  <span className="text-xs text-muted-foreground">
                    부팅할 때 창 없이 트레이에만 올라옵니다. 이 컴퓨터에만 적용됩니다.
                  </span>
                </div>
                <Switch
                  id="setting-autolaunch"
                  checked={autoLaunch.enabled}
                  onCheckedChange={autoLaunch.onChange}
                />
              </div>
            </>
          )}

          {/* 앱 전용 — 전역 단축키·화면 테마·로그아웃은 웹 콘솔에서 의미가 없거나(단축키·테마는 앱 창 것) 사이드바에 이미 있다(로그아웃) */}
          {isApp && (
            <>
            <Separator />

            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <Label htmlFor="setting-shortcut">전역 단축키</Label>
                  <span className="text-xs text-muted-foreground">
                    위즈봇 플레이어 앱을 설치했다면, 창을 열지 않고도 다른 프로그램을 쓰는 중에
                    조작할 수 있습니다.
                  </span>
                </div>
                <Switch
                  id="setting-shortcut"
                  checked={settings.keyboardShortcut}
                  onCheckedChange={onChangeKeyboardShortcut}
                />
              </div>

              {settings.keyboardShortcut && (
                <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
                  {SHORTCUT_ACTIONS.map((action) => (
                    <div key={action.key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{action.label}</span>
                      <ShortcutInput
                        value={settings.shortcuts[action.key]}
                        onChange={(accelerator) =>
                          onChangeShortcuts({ ...settings.shortcuts, [action.key]: accelerator })
                        }
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    버튼을 누른 뒤 원하는 조합을 입력하세요. ⌘/Ctrl · Alt · Shift 중 하나 이상을
                    포함해야 합니다.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <ThemeSection />

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <Label>로그아웃</Label>
                <span className="text-xs text-muted-foreground">
                  앱에서 로그아웃합니다.
                </span>
              </div>
              <Button variant="outline" onClick={() => (location.href = '/login/logout')}>
                <LogOut /> 로그아웃
              </Button>
            </div>

            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <Label>화면 테마</Label>
        <span className="text-xs text-muted-foreground">
          「시스템」 은 운영체제 설정을 따라갑니다.
        </span>
      </div>
      <Select value={theme ?? 'system'} onValueChange={setTheme}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">시스템</SelectItem>
          <SelectItem value="light">라이트</SelectItem>
          <SelectItem value="dark">다크</SelectItem>
        </SelectContent>
      </Select>
    </div>
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

      {settings.sourceType === 'ELECTRON' && (
        <p className="text-xs text-muted-foreground">
          위즈봇 플레이어 앱이 설치돼 있어야 소리가 납니다.{' '}
          {/* 앱 안에서 눌러도 setWindowOpenHandler 가 외부 브라우저로 넘긴다 */}
          <a
            href="/download"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            앱 내려받기
          </a>
        </p>
      )}

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

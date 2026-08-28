'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_THEME,
  isDefaultTheme,
  THEME_FONTS,
  type ThemeFontKey,
  type ThemeInput,
} from '@wizbot/shared/lib/theme';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FONT_FAMILY } from '@/lib/fonts';
import { backgroundContrast, primaryContrast } from '@/lib/streamer-theme';
import { useTRPC } from '@/src/utils/trpc-react';

const SCHEME_LABEL = { SYSTEM: '방문자 설정 따름', LIGHT: '라이트 고정', DARK: '다크 고정' } as const;
/** WCAG AA 본문 기준 */
const MIN_CONTRAST = 4.5;

/**
 * 스트리머 테마 설정 (#77). 저장 전에 아래 미리보기가 같은 코드(StreamerThemeScope)로 그려진다.
 * 폰트 목록은 각 항목을 해당 폰트로 그린다 — 이름만 보고 고를 수 없어서.
 */
export function ThemeSettingsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.user.getTheme.queryOptions());
  const update = useMutation(trpc.user.updateTheme.mutationOptions());
  const reset = useMutation(trpc.user.resetTheme.mutationOptions());

  const [draft, setDraft] = useState<ThemeInput>(DEFAULT_THEME);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.user.getTheme.queryFilter());
    //  레이아웃(RSC)이 그리는 콘솔 테마는 다음 내비게이션에서 반영된다
    window.location.reload();
  };

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        테마를 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);
  const bgContrast = draft.backgroundColor ? backgroundContrast(draft.backgroundColor) : null;
  const primaryCr = draft.primaryColor ? primaryContrast(draft.primaryColor) : null;

  function handleSave() {
    toast.promise(update.mutateAsync(draft), {
      loading: '저장 중...',
      success: () => {
        invalidate();
        return '테마를 저장했습니다.';
      },
      error: (err) => `저장에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  function handleReset() {
    toast.promise(reset.mutateAsync(), {
      loading: '되돌리는 중...',
      success: () => {
        setDraft(DEFAULT_THEME);
        invalidate();
        return '기본 테마로 되돌렸습니다.';
      },
      error: (err) => `실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>테마</CardTitle>
        <CardDescription>
          시청자 페이지·콘솔·플레이어 앱·OBS 자막(폰트)에 적용됩니다. 저장하면 바로 반영됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="primary"
            label="메인 색상"
            value={draft.primaryColor}
            fallback="#343434"
            onChange={(primaryColor) => setDraft((d) => ({ ...d, primaryColor }))}
            hint={
              primaryCr !== null && primaryCr < MIN_CONTRAST
                ? `버튼 글자와의 대비가 낮습니다 (${primaryCr.toFixed(1)}:1). 더 진하거나 연한 색이 읽기 쉽습니다.`
                : undefined
            }
          />
          <ColorField
            id="background"
            label="배경 색상"
            value={draft.backgroundColor}
            fallback="#ffffff"
            onChange={(backgroundColor) => setDraft((d) => ({ ...d, backgroundColor }))}
            hint={
              bgContrast !== null && bgContrast < MIN_CONTRAST
                ? `글자와의 대비가 낮습니다 (${bgContrast.toFixed(1)}:1). 아주 밝거나 아주 어두운 배경이 읽기 쉽습니다.`
                : undefined
            }
          />
          <div className="flex flex-col gap-2">
            <Label>라이트 / 다크</Label>
            <Select
              value={draft.colorScheme}
              onValueChange={(colorScheme) =>
                setDraft((d) => ({ ...d, colorScheme: colorScheme as ThemeInput['colorScheme'] }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCHEME_LABEL) as (keyof typeof SCHEME_LABEL)[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SCHEME_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>폰트</Label>
            <Select
              value={draft.fontKey}
              onValueChange={(fontKey) => setDraft((d) => ({ ...d, fontKey: fontKey as ThemeFontKey }))}
            >
              <SelectTrigger className="w-full" style={{ fontFamily: FONT_FAMILY[draft.fontKey] ?? undefined }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_FONTS.map((font) => (
                  <SelectItem key={font.key} value={font.key} style={{ fontFamily: FONT_FAMILY[font.key] ?? undefined }}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>미리보기</Label>
          <StreamerThemeScope theme={draft} scopeId="preview" className="rounded-md border p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">노래 신청 목록</span>
                <Badge>대기 3곡</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                시청자가 보는 페이지의 글자와 버튼이 이렇게 보입니다. 가나다라마바사 ABC 123
              </p>
              <div className="flex gap-2">
                <Button size="sm">신청하기</Button>
                <Button size="sm" variant="outline">
                  재생 기록
                </Button>
              </div>
            </div>
          </StreamerThemeScope>
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={reset.isPending || isDefaultTheme(data)}
          >
            <RotateCcw />
            기본으로
          </Button>
          <Button onClick={handleSave} disabled={!dirty || update.isPending}>
            저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ColorField({
  id,
  label,
  value,
  fallback,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string | null;
  fallback: string;
  onChange: (value: string | null) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          value={value ?? fallback}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-14 cursor-pointer p-1"
        />
        <span className="font-mono text-xs text-muted-foreground">{value ?? '기본'}</span>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            기본
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-amber-600">{hint}</p>}
    </div>
  );
}

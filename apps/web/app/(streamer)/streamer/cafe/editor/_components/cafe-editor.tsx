'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CAFE_ELEMENT_KINDS,
  CAFE_ELEMENT_LABEL,
  CAFE_MAX_WIDTH,
  type CafeElement,
  type CafeElementKind,
  cafeElementSchema,
  type CafeLayout,
  cafeLayoutSchema,
  type CafeScene,
  elementText,
  EMPTY_LAYOUT,
  OPENED_AT_FORMATS,
  SAMPLE_SNAPSHOT,
  THUMBNAIL_RATIO,
} from '@wizbot/shared/lib/cafeLayout';
import { THEME_FONTS } from '@wizbot/shared/lib/theme';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FontLink } from '@/components/theme/font-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ALL_FONT_KEYS, FONT_FAMILY } from '@/lib/fonts';
import { useTRPC } from '@/src/utils/trpc-react';

import { type DragState,ElementBox } from './element-box';

/**
 * 카페 대문 이미지 에디터 (#9 PR2a).
 * 배경 위에 텍스트 영역·썸네일 영역을 놓는다 — 도형은 없다, 장식은 배경에 이미 있다.
 * 2a: 드래그 이동·리사이즈·수치 패널·두 장면. 스냅·다중 선택 정렬·키보드는 2b.
 */
export function CafeEditor({ channelId }: { channelId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: saved, isPending } = useQuery(trpc.cafe.getLayout.queryOptions());
  const { data: backgrounds } = useQuery(trpc.cafe.backgrounds.queryOptions());
  const save = useMutation(trpc.cafe.saveLayout.mutationOptions());
  const upload = useMutation(trpc.cafe.uploadBackground.mutationOptions());
  const removeBg = useMutation(trpc.cafe.deleteBackground.mutationOptions());

  const [layout, setLayout] = useState<CafeLayout>(EMPTY_LAYOUT);
  const [scene, setScene] = useState<CafeScene>('live');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bgVersion, setBgVersion] = useState(0);
  useEffect(() => {
    if (saved) setLayout(cafeLayoutSchema.parse(saved));
  }, [saved]);

  const current = layout[scene];
  const selected = current.elements.find((e) => e.id === selectedId) ?? null;
  const hasBackground = backgrounds?.some((b) => b.scene === scene) ?? false;
  const dirty = JSON.stringify(layout) !== JSON.stringify(saved ? cafeLayoutSchema.parse(saved) : EMPTY_LAYOUT);

  function updateScene(patch: (elements: CafeElement[]) => CafeElement[]) {
    setLayout((prev) => ({ ...prev, [scene]: { ...prev[scene], elements: patch(prev[scene].elements) } }));
  }
  function updateElement(id: string, patch: Partial<CafeElement>) {
    updateScene((elements) => elements.map((e) => (e.id === id ? ({ ...e, ...patch } as CafeElement) : e)));
  }
  function addElement(kind: CafeElementKind) {
    const id = `${kind}-${Date.now().toString(36)}`;
    const base = { id, x: 40, y: 40 + current.elements.length * 20, w: kind === 'thumbnail' ? 320 : 480, h: kind === 'thumbnail' ? Math.round(320 / THUMBNAIL_RATIO) : 60 };
    const element = cafeElementSchema.parse(kind === 'thumbnail' ? { ...base, kind } : { ...base, kind, color: '#ffffff' });
    updateScene((elements) => [...elements, element]);
    setSelectedId(id);
  }
  function removeElement(id: string) {
    updateScene((elements) => elements.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleUpload(file: File) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      toast.error('PNG 또는 JPEG 파일만 올릴 수 있습니다.');
      return;
    }
    //  네이버 카페 대문 최대 폭(836)으로 줄여서 보낸다 — 그보다 크면 캔버스도 커지고 대문에서 축소된다
    void downscaleToWidth(file, CAFE_MAX_WIDTH).then(({ base64, resized }) => {
      if (base64.length > 3 * 1024 * 1024) {
        toast.error('줄인 뒤에도 2MB 를 넘습니다. 더 작은 이미지를 올려주세요.');
        return;
      }
      toast.promise(upload.mutateAsync({ scene, base64 }), {
        loading: '업로드 중...',
        success: (r) => {
          void queryClient.invalidateQueries(trpc.cafe.backgrounds.queryFilter());
          void queryClient.invalidateQueries(trpc.cafe.getLayout.queryFilter());
          setBgVersion((v) => v + 1);
          return `배경을 올렸습니다 (${r.width}×${r.height})${resized ? ' — 가로 836px 로 줄였습니다' : ''}. 캔버스 크기를 맞췄습니다.`;
        },
        error: (err) => (err instanceof Error ? err.message : String(err)),
      });
    });
  }

  function handleSave() {
    toast.promise(save.mutateAsync(layout), {
      loading: '저장 중...',
      success: () => {
        void queryClient.invalidateQueries(trpc.cafe.getLayout.queryFilter());
        return '레이아웃을 저장했습니다.';
      },
      error: (err) => (err instanceof Error ? err.message : String(err)),
    });
  }

  if (isPending) return <Skeleton className="h-[600px] w-full" />;

  const usedKinds = new Set(current.elements.map((e) => e.kind));
  const previewUrl = `/cafe/${channelId}.png?preview=1&scene=${scene}&t=${Date.now()}`;

  const imageOnly = scene === 'offline';

  return (
    <div className="flex min-w-0 flex-col gap-4 py-4">
      {/* 요소·속성 패널이 폰트를 실제 모양으로 보이도록 전체를 링크한다 */}
      <FontLink keys={ALL_FONT_KEYS} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-md border p-1">
          {(['live', 'offline'] as const).map((s) => (
            <Button key={s} size="sm" variant={scene === s ? 'default' : 'ghost'} onClick={() => { setScene(s); setSelectedId(null); }}>
              {s === 'live' ? '방송 중' : '방송 종료'}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={previewUrl} target="_blank" rel="noreferrer">실제 렌더 미리보기</a>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || save.isPending}>저장</Button>
        </div>
      </div>

      {/* minmax(0,1fr): 캔버스의 원본 폭이 열을 밀어 가로 스크롤을 만들지 않게 */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Canvas
            key={`${scene}-${bgVersion}`}
            width={current.width}
            height={current.height}
            backgroundUrl={hasBackground ? `/cafe/${channelId}/background?scene=${scene}&v=${bgVersion}` : null}
            elements={imageOnly ? [] : current.elements}
            selectedId={selectedId}
            scene={scene}
            onSelect={setSelectedId}
            onChange={updateElement}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
              <ImagePlus className="size-4" />
              {hasBackground ? '배경 바꾸기' : '배경 올리기'}
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            </label>
            {hasBackground && (
              <Button variant="ghost" size="sm" onClick={() => toast.promise(removeBg.mutateAsync({ scene }), { loading: '삭제 중...', success: () => { void queryClient.invalidateQueries(trpc.cafe.backgrounds.queryFilter()); setBgVersion((v) => v + 1); return '배경을 지웠습니다.'; }, error: (e) => String(e) })}>
                배경 삭제
              </Button>
            )}
            <span className="text-xs text-muted-foreground">캔버스 {current.width}×{current.height} · 배경 크기를 따릅니다 (PNG/JPEG, 가로 최대 836px, 2MB)</span>
          </div>
          {imageOnly ? (
            <p className="text-sm text-muted-foreground">방송 종료 화면은 배경 이미지만 씁니다 — 제목·시청자 수 같은 요소는 방송 중 화면에서 배치합니다.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {CAFE_ELEMENT_KINDS.map((kind) => (
                <Button key={kind} variant="outline" size="sm" disabled={usedKinds.has(kind)} onClick={() => addElement(kind)}>
                  <Plus className="size-4" /> {CAFE_ELEMENT_LABEL[kind]}
                </Button>
              ))}
            </div>
          )}
        </div>

        {imageOnly ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">방송 종료 화면에는 배치할 요소가 없습니다.</div>
        ) : (
          <PropertyPanel element={selected} onChange={(patch) => selected && updateElement(selected.id, patch)} onRemove={() => selected && removeElement(selected.id)} />
        )}
      </div>
    </div>
  );
}

/* ── 캔버스 ── */

function Canvas({
  width, height, backgroundUrl, elements, selectedId, scene, onSelect, onChange,
}: {
  width: number; height: number; backgroundUrl: string | null; elements: CafeElement[]; selectedId: string | null; scene: CafeScene;
  onSelect: (id: string | null) => void; onChange: (id: string, patch: Partial<CafeElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const drag = useRef<DragState | null>(null);

  return (
    <div ref={ref} className="w-full overflow-hidden rounded-md border bg-muted/30">
      <div
        className="relative origin-top-left select-none"
        style={{ width, height, transform: `scale(${scale})`, marginBottom: (scale - 1) * height, backgroundColor: '#1b1b2f' }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
      >
        {backgroundUrl && <img src={backgroundUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />}
        {elements.map((element) => (
          <ElementBox
            key={element.id}
            element={element}
            selected={element.id === selectedId}
            scale={scale}
            sampleText={element.kind === 'thumbnail' ? '' : elementText(element.kind, SAMPLE_SNAPSHOT[scene], element)}
            fontFamily={element.kind === 'thumbnail' ? undefined : FONT_FAMILY[element.fontKey] ?? undefined}
            dragRef={drag}
            canvas={{ width, height }}
            onSelect={() => onSelect(element.id)}
            onChange={(patch) => onChange(element.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── 속성 패널 ── */

function PropertyPanel({ element, onChange, onRemove }: { element: CafeElement | null; onChange: (patch: Partial<CafeElement>) => void; onRemove: () => void }) {
  if (!element) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        요소를 클릭하면 위치·크기·글자를 수치로 조절할 수 있습니다. 배경 위 장식은 이미지에 미리 그려서 올리세요.
      </div>
    );
  }
  //  썸네일은 16:9 고정 — 한쪽을 바꾸면 다른 쪽이 따라온다
  const setSize = (key: 'x' | 'y' | 'w' | 'h', value: number) => {
    if (element.kind === 'thumbnail' && key === 'w') return onChange({ w: value, h: Math.round(value / THUMBNAIL_RATIO) });
    if (element.kind === 'thumbnail' && key === 'h') return onChange({ h: value, w: Math.round(value * THUMBNAIL_RATIO) });
    onChange({ [key]: value } as Partial<CafeElement>);
  };
  const num = (key: 'x' | 'y' | 'w' | 'h') => (
    <div className="flex flex-col gap-1">
      <Label className="text-xs uppercase">{key}</Label>
      <Input type="number" value={Math.round(element[key])} onChange={(e) => setSize(key, Number(e.target.value))} className="h-8" />
    </div>
  );
  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">{CAFE_ELEMENT_LABEL[element.kind]}</span>
        <Button variant="ghost" size="sm" onClick={onRemove}><Trash2 className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-4 gap-2">{num('x')}{num('y')}{num('w')}{num('h')}</div>

      {element.kind === 'thumbnail' ? (
        <>
          <p className="text-xs text-muted-foreground">썸네일은 16:9 비율로 고정됩니다.</p>
          <Field label="맞춤">
            <Select value={element.fit} onValueChange={(fit) => onChange({ fit: fit as 'cover' | 'contain' })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="cover">채우기 (잘림)</SelectItem><SelectItem value="contain">맞추기 (여백)</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="모서리 둥글기"><Input type="number" className="h-8" value={element.radius} onChange={(e) => onChange({ radius: Number(e.target.value) })} /></Field>
        </>
      ) : (
        <>
          <Field label="폰트">
            <Select value={element.fontKey} onValueChange={(fontKey) => onChange({ fontKey } as Partial<CafeElement>)}>
              <SelectTrigger className="h-8" style={{ fontFamily: FONT_FAMILY[element.fontKey] ?? undefined }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {THEME_FONTS.map((f) => <SelectItem key={f.key} value={f.key} style={{ fontFamily: FONT_FAMILY[f.key] ?? undefined }}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="굵기">
              <Select value={String(element.weight)} onValueChange={(w) => onChange({ weight: Number(w) as 400 | 700 })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="400">보통</SelectItem><SelectItem value="700">굵게</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="정렬">
              <Select value={element.align} onValueChange={(align) => onChange({ align: align as 'left' | 'center' | 'right' })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="left">왼쪽</SelectItem><SelectItem value="center">가운데</SelectItem><SelectItem value="right">오른쪽</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="색">
              <div className="flex items-center gap-2">
                <Input type="color" value={element.color} onChange={(e) => onChange({ color: e.target.value })} className="h-8 w-12 p-1" />
                <span className="font-mono text-xs">{element.color}</span>
              </div>
            </Field>
            <Field label="글자 크기">
              <div className="flex items-center gap-1">
                <Input type="number" className="h-8" placeholder="자동" value={element.fontSize ?? ''} onChange={(e) => onChange({ fontSize: e.target.value ? Number(e.target.value) : null })} />
                {element.fontSize !== null && <Button variant="ghost" size="sm" onClick={() => onChange({ fontSize: null })}>자동</Button>}
              </div>
            </Field>
          </div>
          <Field label="최대 줄 수">
            <Select value={String(element.lines)} onValueChange={(lines) => onChange({ lines: Number(lines) } as Partial<CafeElement>)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}줄</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <p className="text-xs text-muted-foreground">글자 크기가 「자동」이면 (영역 높이 ÷ 줄 수)의 80%로 시작해 가로를 넘지 않게 줄이고, 그래도 넘치면 마지막 줄을 …으로 자릅니다.</p>
          {element.kind === 'openedAt' && (
            <Field label="시간 형식">
              <Select value={element.timeFormat} onValueChange={(timeFormat) => onChange({ timeFormat } as Partial<CafeElement>)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(OPENED_AT_FORMATS) as (keyof typeof OPENED_AT_FORMATS)[]).map((f) => <SelectItem key={f} value={f}>{OPENED_AT_FORMATS[f]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          {element.kind === 'viewers' && (
            <Field label="단위"><Input className="h-8" value={element.suffix} maxLength={10} onChange={(e) => onChange({ suffix: e.target.value })} /></Field>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}


/** 브라우저에서 가로를 maxWidth 로 줄여 base64 로. 원본이 작으면 그대로 */
async function downscaleToWidth(file: File, maxWidth: number): Promise<{ base64: string; resized: boolean }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  //  PNG 는 투명도를 지킨다. JPEG 원본은 JPEG 로 (용량)
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(type, 0.92);
  return { base64: dataUrl.split(',')[1] ?? '', resized: scale < 1 };
}

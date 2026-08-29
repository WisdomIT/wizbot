'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CAFE_ELEMENT_KINDS,
  CAFE_ELEMENT_LABEL,
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
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceBetween,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceBetween, ImagePlus, Plus, Redo2, Trash2, Undo2,
} from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { FontLink } from '@/components/theme/font-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  type AlignOp, alignRects, boundsOf, collectSnapLines, type Guide, type Handle, intersects, type Rect, rectFromPoints, snapMove, snapResize,
} from '@/lib/cafe-geometry';
import { ALL_FONT_KEYS, FONT_FAMILY } from '@/lib/fonts';
import { useHistory } from '@/lib/use-history';
import { useTRPC } from '@/src/utils/trpc-react';

import { ElementBox } from './element-box';

const MIN_SIZE = 16;
/** 스냅 임계값 — 화면 픽셀 기준 */
const SNAP_PX = 6;

type Patches = Record<string, Partial<CafeElement>>;

/**
 * 카페 대문 이미지 에디터 (#9).
 * 배경 위에 텍스트 영역·썸네일 영역을 놓는다 — 도형은 없다, 장식은 배경에 이미 있다.
 * 2a: 드래그 이동·리사이즈·수치 패널·두 장면. 2b: 스냅 가이드·다중 선택(Shift+클릭, 영역 드래그)·정렬/분배·방향키·되돌리기.
 */
export function CafeEditor({ channelId }: { channelId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: saved, isPending } = useQuery(trpc.cafe.getLayout.queryOptions());
  const { data: backgrounds } = useQuery(trpc.cafe.backgrounds.queryOptions());
  const save = useMutation(trpc.cafe.saveLayout.mutationOptions());
  const upload = useMutation(trpc.cafe.uploadBackground.mutationOptions());
  const removeBg = useMutation(trpc.cafe.deleteBackground.mutationOptions());

  const history = useHistory<CafeLayout>(EMPTY_LAYOUT);
  const layout = history.present;
  const [scene, setScene] = useState<CafeScene>('live');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [alignToCanvas, setAlignToCanvas] = useState(false);
  const [bgVersion, setBgVersion] = useState(0);
  useEffect(() => {
    if (saved) history.reset(cafeLayoutSchema.parse(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const current = layout[scene];
  const selected = current.elements.filter((e) => selectedIds.includes(e.id));
  const single = selected.length === 1 ? selected[0] : null;
  const hasBackground = backgrounds?.some((b) => b.scene === scene) ?? false;
  const dirty = JSON.stringify(layout) !== JSON.stringify(saved ? cafeLayoutSchema.parse(saved) : EMPTY_LAYOUT);
  const imageOnly = scene === 'offline';

  function updateScene(patch: (elements: CafeElement[]) => CafeElement[], transient = false) {
    history.update((prev) => ({ ...prev, [scene]: { ...prev[scene], elements: patch(prev[scene].elements) } }), { transient });
  }
  function applyPatches(patches: Patches, transient = false) {
    updateScene((elements) => elements.map((e) => (patches[e.id] ? ({ ...e, ...patches[e.id] } as CafeElement) : e)), transient);
  }
  function updateElement(id: string, patch: Partial<CafeElement>) {
    applyPatches({ [id]: patch });
  }
  function addElement(kind: CafeElementKind) {
    const id = `${kind}-${Date.now().toString(36)}`;
    const base = { id, x: 40, y: 40 + current.elements.length * 20, w: kind === 'thumbnail' ? 320 : 480, h: kind === 'thumbnail' ? Math.round(320 / THUMBNAIL_RATIO) : 60 };
    const element = cafeElementSchema.parse(kind === 'thumbnail' ? { ...base, kind } : { ...base, kind, color: '#ffffff' });
    updateScene((elements) => [...elements, element]);
    setSelectedIds([id]);
  }
  function removeSelected() {
    const ids = new Set(selectedIds);
    updateScene((elements) => elements.filter((e) => !ids.has(e.id)));
    setSelectedIds([]);
  }
  /** 방향키 이동 — 캔버스 안에서 clamp. 누르고 있는 동안은 한 묶음(keyup 에서 끝) */
  function nudge(dx: number, dy: number) {
    const patches: Patches = {};
    for (const e of selected) {
      patches[e.id] = {
        x: Math.min(Math.max(0, e.x + dx), current.width - e.w),
        y: Math.min(Math.max(0, e.y + dy), current.height - e.h),
      };
    }
    applyPatches(patches, true);
  }
  /** 정렬·분배 — 여러 개면 선택 영역(또는 캔버스) 기준, 하나면 캔버스 기준 */
  function align(op: AlignOp) {
    if (selected.length === 0) return;
    const canvasRect: Rect = { x: 0, y: 0, w: current.width, h: current.height };
    const frame = selected.length > 1 && !alignToCanvas ? boundsOf(selected) : canvasRect;
    const patches: Patches = {};
    for (const r of alignRects(selected, op, frame)) patches[r.id] = { x: r.x, y: r.y };
    applyPatches(patches);
  }

  //  키보드: 방향키 이동(Shift 10px)·Delete·Esc·Ctrl+A·Ctrl+Z/Y. 입력란에 포커스가 있으면 건드리지 않는다
  useEffect(() => {
    function inField(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || !!el.closest('[role="combobox"],[role="listbox"],[role="dialog"]'));
    }
    function onKeyDown(e: KeyboardEvent) {
      if (inField(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) history.redo(); else history.undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); history.redo(); return; }
      if (imageOnly) return;
      if (mod && key === 'a') { e.preventDefault(); setSelectedIds(current.elements.map((el) => el.id)); return; }
      if (e.key === 'Escape') { setSelectedIds([]); return; }
      if (selected.length === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
      const step = e.shiftKey ? 10 : 1;
      const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
      if (!delta) return;
      e.preventDefault();
      nudge(delta[0], delta[1]);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key.startsWith('Arrow')) history.endTransient();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  });

  function handleUpload(file: File) {
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      toast.error('PNG 또는 JPEG 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('배경 이미지는 2MB 이하여야 합니다.');
      return;
    }
    //  원본 그대로 올린다 — 대문의 <img> 크기는 지정한 요소를 따른다
    void fileToBase64(file).then((base64) => {
      toast.promise(upload.mutateAsync({ scene, base64 }), {
        loading: '업로드 중...',
        success: (r) => {
          void queryClient.invalidateQueries(trpc.cafe.backgrounds.queryFilter());
          void queryClient.invalidateQueries(trpc.cafe.getLayout.queryFilter());
          setBgVersion((v) => v + 1);
          return `배경을 올렸습니다 (${r.width}×${r.height}). 캔버스 크기를 맞췄습니다.`;
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

  return (
    <div className="flex min-w-0 flex-col gap-4 py-4">
      {/* 요소·속성 패널이 폰트를 실제 모양으로 보이도록 전체를 링크한다 */}
      <FontLink keys={ALL_FONT_KEYS} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border p-1">
            {(['live', 'offline'] as const).map((s) => (
              <Button key={s} size="sm" variant={scene === s ? 'default' : 'ghost'} onClick={() => { setScene(s); setSelectedIds([]); }}>
                {s === 'live' ? '방송 중' : '방송 종료'}
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="sm" title="되돌리기 (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}><Undo2 className="size-4" /></Button>
          <Button variant="ghost" size="sm" title="다시 실행 (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={history.redo}><Redo2 className="size-4" /></Button>
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
            selectedIds={selectedIds}
            scene={scene}
            onSelect={setSelectedIds}
            onChange={applyPatches}
            onDragEnd={history.endTransient}
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
            <span className="text-xs text-muted-foreground">캔버스 {current.width}×{current.height} · 배경 크기를 따릅니다 (PNG/JPEG, 2MB 이하)</span>
          </div>
          {imageOnly ? (
            <p className="text-sm text-muted-foreground">방송 종료 화면은 배경 이미지만 씁니다 — 제목·시청자 수 같은 요소는 방송 중 화면에서 배치합니다.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {CAFE_ELEMENT_KINDS.map((kind) => (
                  <Button key={kind} variant="outline" size="sm" disabled={usedKinds.has(kind)} onClick={() => addElement(kind)}>
                    <Plus className="size-4" /> {CAFE_ELEMENT_LABEL[kind]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Shift+클릭·빈 곳 드래그로 여러 개 선택 · 방향키 이동 (Shift: 10px) · Alt 누르고 드래그하면 스냅 해제 · Delete 삭제 · Ctrl+Z 되돌리기
              </p>
            </>
          )}
        </div>

        {imageOnly ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">방송 종료 화면에는 배치할 요소가 없습니다.</div>
        ) : selected.length > 1 ? (
          <div className="flex flex-col gap-4 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{selected.length}개 선택</span>
              <Button variant="ghost" size="sm" onClick={removeSelected}><Trash2 className="size-4" /></Button>
            </div>
            <AlignButtons onAlign={align} distribute={selected.length >= 3} />
            <div className="flex items-center gap-2">
              <Switch id="align-to-canvas" checked={alignToCanvas} onCheckedChange={setAlignToCanvas} />
              <Label htmlFor="align-to-canvas" className="text-sm">캔버스 기준으로 정렬</Label>
            </div>
            <p className="text-xs text-muted-foreground">기본은 선택한 요소들이 차지한 영역 기준입니다. 균등 분배는 3개 이상일 때 첫/끝 요소를 두고 사이 간격을 같게 합니다.</p>
          </div>
        ) : (
          <PropertyPanel element={single} onChange={(patch) => single && updateElement(single.id, patch)} onRemove={removeSelected} onAlign={align} />
        )}
      </div>
    </div>
  );
}

/* ── 정렬 버튼 ── */

function AlignButtons({ onAlign, distribute }: { onAlign: (op: AlignOp) => void; distribute: boolean }) {
  const btn = (op: AlignOp, title: string, Icon: typeof AlignStartVertical) => (
    <Button key={op} variant="outline" size="sm" title={title} onClick={() => onAlign(op)}><Icon className="size-4" /></Button>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1">
        {btn('left', '왼쪽 정렬', AlignStartVertical)}
        {btn('centerX', '가로 가운데 정렬', AlignCenterVertical)}
        {btn('right', '오른쪽 정렬', AlignEndVertical)}
        {btn('top', '위쪽 정렬', AlignStartHorizontal)}
        {btn('centerY', '세로 가운데 정렬', AlignCenterHorizontal)}
        {btn('bottom', '아래쪽 정렬', AlignEndHorizontal)}
      </div>
      {distribute && (
        <div className="grid grid-cols-2 gap-1">
          {btn('distributeX', '가로 균등 분배', AlignHorizontalSpaceBetween)}
          {btn('distributeY', '세로 균등 분배', AlignVerticalSpaceBetween)}
        </div>
      )}
    </div>
  );
}

/* ── 캔버스 ── */

type DragState =
  | { mode: 'move'; ids: string[]; startX: number; startY: number; origins: Record<string, Rect> }
  | { mode: 'resize'; id: string; handle: Handle; startX: number; startY: number; origin: Rect }
  | { mode: 'marquee'; start: { x: number; y: number }; base: string[] };

function Canvas({
  width, height, backgroundUrl, elements, selectedIds, scene, onSelect, onChange, onDragEnd,
}: {
  width: number; height: number; backgroundUrl: string | null; elements: CafeElement[]; selectedIds: string[]; scene: CafeScene;
  onSelect: (ids: string[]) => void; onChange: (patches: Patches, transient: boolean) => void; onDragEnd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const drag = useRef<DragState | null>(null);
  const canvasRect = useMemo(() => ({ width, height }), [width, height]);

  function toCanvas(e: ReactPointerEvent) {
    const r = stage.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }
  function rectOf(el: CafeElement): Rect { return { x: el.x, y: el.y, w: el.w, h: el.h }; }

  function startElement(e: ReactPointerEvent, element: CafeElement, mode: 'move' | 'resize', handle?: Handle) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    if (mode === 'resize') {
      drag.current = { mode, id: element.id, handle: handle ?? 'se', startX: e.clientX, startY: e.clientY, origin: rectOf(element) };
      return;
    }
    //  Shift+클릭은 선택 토글만. 선택 안 된 요소를 잡으면 그것만 선택한 채 이동 시작
    if (e.shiftKey) {
      onSelect(selectedIds.includes(element.id) ? selectedIds.filter((id) => id !== element.id) : [...selectedIds, element.id]);
      return;
    }
    const ids = selectedIds.includes(element.id) ? selectedIds : [element.id];
    if (ids !== selectedIds) onSelect(ids);
    const origins: Record<string, Rect> = {};
    for (const el of elements) if (ids.includes(el.id)) origins[el.id] = rectOf(el);
    drag.current = { mode, ids, startX: e.clientX, startY: e.clientY, origins };
  }
  function startMarquee(e: ReactPointerEvent) {
    if (e.target !== e.currentTarget) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const base = e.shiftKey ? selectedIds : [];
    if (!e.shiftKey) onSelect([]);
    drag.current = { mode: 'marquee', start: toCanvas(e), base };
  }

  function move(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const threshold = e.altKey ? 0 : SNAP_PX / scale;
    if (d.mode === 'marquee') {
      const box = rectFromPoints(d.start, toCanvas(e));
      setMarquee(box);
      const hit = elements.filter((el) => intersects(box, rectOf(el))).map((el) => el.id);
      onSelect([...new Set([...d.base, ...hit])]);
      return;
    }
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (d.mode === 'move') {
      //  선택 묶음의 경계 상자를 옮기고 스냅한 뒤, 같은 이동량을 전부에 적용
      const group = boundsOf(Object.values(d.origins));
      const lines = collectSnapLines(canvasRect, elements.filter((el) => !d.ids.includes(el.id)).map(rectOf));
      const clamp = (r: Rect) => ({ ...r, x: Math.min(Math.max(0, r.x), width - r.w), y: Math.min(Math.max(0, r.y), height - r.h) });
      const raw = clamp({ ...group, x: group.x + dx, y: group.y + dy });
      const snapped = threshold ? snapMove(raw, lines, threshold) : { ...raw, guides: [] };
      const moved = clamp({ ...group, x: snapped.x, y: snapped.y });
      const patches: Patches = {};
      for (const [id, o] of Object.entries(d.origins)) patches[id] = { x: Math.round(o.x + moved.x - group.x), y: Math.round(o.y + moved.y - group.y) };
      setGuides(moved.x === snapped.x && moved.y === snapped.y ? snapped.guides : []);
      onChange(patches, true);
      return;
    }
    const element = elements.find((el) => el.id === d.id);
    if (!element) return;
    const o = d.origin;
    let { x, y, w, h } = o;
    const hd = d.handle;
    if (hd.includes('e')) w = Math.max(MIN_SIZE, o.w + dx);
    if (hd.includes('s')) h = Math.max(MIN_SIZE, o.h + dy);
    if (hd.includes('w')) { w = Math.max(MIN_SIZE, o.w - dx); x = o.x + (o.w - w); }
    if (hd.includes('n')) { h = Math.max(MIN_SIZE, o.h - dy); y = o.y + (o.h - h); }
    let snapGuides: Guide[] = [];
    if (threshold) {
      const lines = collectSnapLines(canvasRect, elements.filter((el) => el.id !== d.id).map(rectOf));
      const s = snapResize({ x, y, w, h }, hd, lines, threshold);
      ({ x, y, w, h } = s.rect);
      snapGuides = s.guides;
    }
    if (element.kind === 'thumbnail') {
      // 16:9 고정 — 가로를 잡는 핸들이면 세로가, 세로만 잡으면 가로가 따라온다. 따라오는 축의 가이드는 의미가 없으니 뺀다
      if (hd === 'n' || hd === 's') { w = h * THUMBNAIL_RATIO; snapGuides = snapGuides.filter((g) => g.axis === 'y'); }
      else { h = w / THUMBNAIL_RATIO; snapGuides = snapGuides.filter((g) => g.axis === 'x'); }
      if (hd.includes('w')) x = o.x + o.w - w;
      if (hd.includes('n')) y = o.y + o.h - h;
    }
    setGuides(snapGuides);
    onChange({ [d.id]: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } }, true);
  }
  function end() {
    if (!drag.current) return;
    drag.current = null;
    setGuides([]);
    setMarquee(null);
    onDragEnd();
  }

  return (
    <div ref={ref} className="w-full overflow-hidden rounded-md border bg-muted/30">
      <div
        ref={stage}
        className="relative origin-top-left select-none"
        style={{ width, height, transform: `scale(${scale})`, marginBottom: (scale - 1) * height, backgroundColor: '#1b1b2f' }}
        onPointerDown={startMarquee}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {backgroundUrl && <img src={backgroundUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />}
        {elements.map((element) => (
          <ElementBox
            key={element.id}
            element={element}
            selected={selectedIds.includes(element.id)}
            resizable={selectedIds.length === 1 && selectedIds[0] === element.id}
            scale={scale}
            sampleText={element.kind === 'thumbnail' ? '' : elementText(element.kind, SAMPLE_SNAPSHOT[scene], element)}
            fontFamily={element.kind === 'thumbnail' ? undefined : FONT_FAMILY[element.fontKey] ?? undefined}
            onPointerDown={(e, mode, handle) => startElement(e, element, mode, handle)}
          />
        ))}
        {guides.map((g, i) => (
          <div
            key={i}
            className="pointer-events-none absolute bg-pink-500"
            style={g.axis === 'x' ? { left: g.at, top: 0, width: 1 / scale, height: '100%' } : { top: g.at, left: 0, height: 1 / scale, width: '100%' }}
          />
        ))}
        {marquee && (
          <div className="pointer-events-none absolute border border-sky-400 bg-sky-400/20" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderWidth: 1 / scale }} />
        )}
      </div>
    </div>
  );
}

/* ── 속성 패널 ── */

function PropertyPanel({ element, onChange, onRemove, onAlign }: { element: CafeElement | null; onChange: (patch: Partial<CafeElement>) => void; onRemove: () => void; onAlign: (op: AlignOp) => void }) {
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
      <Field label="캔버스 기준 정렬"><AlignButtons onAlign={onAlign} distribute={false} /></Field>

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


function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

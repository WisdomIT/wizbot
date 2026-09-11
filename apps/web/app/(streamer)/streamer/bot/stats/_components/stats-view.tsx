'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSearchState } from '@/src/hooks/use-search-state';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 명령어 사용 통계 (#276 2단계) — 최근 7일/30일 순위, 누적 호출 추이(상위 5 + 기타), 없는·꺼진 명령어 호출.
 * 차트는 외부 라이브러리 없이 HTML/SVG. 색은 시리즈 순서에 고정(순위가 바뀌어도 같은 명령어는 같은 색),
 * 「기타」는 회색. 값은 항상 글자로도 보인다 — 색만으로 읽지 않게.
 */

const RANK_TOP = 10;
const DEFAULTS = { days: '30' };
const OUTCOME_LABEL = { NOT_FOUND: '없는 명령어', USAGE_ERROR: '용법 오류', NO_PERMISSION: '권한 없음' } as const;
const fmt = (value: number) => value.toLocaleString('ko-KR');

/** 시리즈 색 — 라이트/다크 각각 검증한 팔레트(dataviz). 「기타」는 muted */
const SERIES_VARS = ['--viz-1', '--viz-2', '--viz-3', '--viz-4', '--viz-5'];
const seriesColor = (index: number, name: string) => (name === '기타' ? 'var(--viz-etc)' : `var(${SERIES_VARS[index % SERIES_VARS.length]})`);

export function StatsView() {
  const trpc = useTRPC();
  const [state, setState] = useSearchState(DEFAULTS);
  const days = state.days === '7' ? 7 : 30;
  const { data, isPending, error } = useQuery(
    trpc.command.getCommandStats.queryOptions({ days }, { placeholderData: keepPreviousData }),
  );

  return (
    <div className="stats-viz flex max-w-5xl flex-col gap-4 py-4">
      <style>{`
        .stats-viz { --viz-1: #2a78d6; --viz-2: #eb6834; --viz-3: #1baf7a; --viz-4: #eda100; --viz-5: #e87ba4; --viz-etc: #9a9a94; }
        .dark .stats-viz { --viz-1: #3987e5; --viz-2: #d95926; --viz-3: #199e70; --viz-4: #c98500; --viz-5: #d55181; --viz-etc: #6f6f6a; }
      `}</style>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          시청자가 채팅에서 명령어를 부른 기록입니다. 없는 명령어를 부른 것도 셉니다. 기록은 90일 보관됩니다.
        </p>
        <div className="ml-auto flex gap-1">
          {(['7', '30'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={state.days === option ? 'default' : 'outline'}
              onClick={() => setState({ days: option })}
              aria-pressed={state.days === option}
            >
              최근 {option}일
            </Button>
          ))}
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : error ? (
        <p className="py-8 text-sm text-muted-foreground">통계를 불러오지 못했습니다: {error.message}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="호출" value={fmt(data.total)} />
            <Stat label="응답한 호출" value={fmt(data.matched)} />
            <Stat label="없는·거절된 호출" value={fmt(data.total - data.matched)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">많이 쓰인 명령어</CardTitle>
              <CardDescription>최근 {days}일 호출 수. 상위 {RANK_TOP}개, 나머지는 기타로 묶었습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.ranking.length === 0 ? (
                <Empty>기간 내 호출된 명령어가 없습니다.</Empty>
              ) : (
                <RankingBars ranking={data.ranking} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">누적 호출 추이</CardTitle>
              <CardDescription>기간 시작부터 그날까지 쌓인 호출 수. 한국 시간 자정 기준, 상위 5개 명령어와 기타.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.matched === 0 ? <Empty>기간 내 호출이 없습니다.</Empty> : <CumulativeLines labels={data.daily.labels} series={data.daily.series} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">응답하지 못한 호출</CardTitle>
              <CardDescription>없는(또는 꺼진) 명령어, 용법을 틀린 호출, 권한이 없어 거절된 호출. 이름은 시청자가 입력한 그대로입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.unmatched.length === 0 ? (
                <Empty>응답하지 못한 호출이 없습니다.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>입력</TableHead>
                      <TableHead className="w-32">종류</TableHead>
                      <TableHead className="w-24 text-right">호출</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unmatched.map((row) => (
                      <TableRow key={`${row.outcome}:${row.command}`}>
                        <TableCell className="font-mono text-sm">!{row.command}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{OUTCOME_LABEL[row.outcome]}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(row.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/** 순위 — 가로 막대 + 값 라벨. 행 자체가 표라 별도 표 보기가 필요 없다 */
function RankingBars({ ranking }: { ranking: { type: string; id: number; command: string; count: number; deleted: boolean }[] }) {
  const top = ranking.slice(0, RANK_TOP);
  const rest = ranking.slice(RANK_TOP);
  const etc = rest.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(top[0]?.count ?? 0, etc, 1);
  const rows = [
    ...top.map((row, index) => ({ key: `${row.type}:${row.id}`, name: `!${row.command}${row.deleted ? ' (삭제됨)' : ''}`, count: row.count, color: seriesColor(index, row.command) })),
    ...(etc > 0 ? [{ key: 'etc', name: `기타 ${rest.length}개`, count: etc, color: 'var(--viz-etc)' }] : []),
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[minmax(6rem,12rem)_1fr_4rem] items-center gap-3 text-sm">
          <span className="truncate" title={row.name}>{row.name}</span>
          <div className="h-3 overflow-hidden rounded-r-sm bg-muted/60" title={`${row.name} · ${fmt(row.count)}회`}>
            <div className="h-full rounded-r-sm" style={{ width: `${(row.count / max) * 100}%`, background: row.color, minWidth: row.count > 0 ? 2 : 0 }} />
          </div>
          <span className="text-right tabular-nums">{fmt(row.count)}</span>
        </div>
      ))}
    </div>
  );
}

/** 누적 선 그래프 — 서버는 일별 값을 주고 여기서 누적한다. hover 로 그날까지의 누적 내역, 아래에 범례와 표 보기 */
function CumulativeLines({ labels, series }: { labels: string[]; series: { name: string; values: number[] }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cumulative = series.map((line) => {
    let sum = 0;
    return { name: line.name, values: line.values.map((value) => (sum += value)) };
  });
  const colors = series.map((line, index) => seriesColor(index, line.name));
  const width = 600;
  const height = 180;
  const pad = 6;
  const max = Math.max(...cumulative.flatMap((line) => line.values), 1);
  const x = (index: number) => (labels.length > 1 ? (index / (labels.length - 1)) * width : width / 2);
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2);

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(labels.length - 1, Math.round(ratio * (labels.length - 1)))));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-44 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="명령어별 누적 호출 수"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* 기준선·격자는 눈에 띄지 않게 */}
          <line x1="0" y1={height - pad} x2={width} y2={height - pad} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {cumulative.map((line, index) => (
            <polyline
              key={line.name}
              fill="none"
              stroke={colors[index]}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              points={line.values.map((value, i) => `${x(i)},${y(value)}`).join(' ')}
            />
          ))}
          {hover !== null && (
            <>
              <line x1={x(hover)} y1={pad} x2={x(hover)} y2={height - pad} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {cumulative.map((line, index) => (
                <circle key={line.name} cx={x(hover)} cy={y(line.values[hover])} r="4" fill={colors[index]} stroke="var(--background)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              ))}
            </>
          )}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-0 right-0 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur">
            <div className="mb-1 font-medium">{labels[hover]}까지 누적</div>
            {cumulative.map((line, index) => (
              <div key={line.name} className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full" style={{ background: colors[index] }} />
                {line.name} {fmt(line.values[hover])}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {cumulative.map((line, index) => (
          <span key={line.name} className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: colors[index] }} />
            {line.name} ({fmt(line.values[line.values.length - 1] ?? 0)})
          </span>
        ))}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">표로 보기 (누적)</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-right tabular-nums">
            <thead>
              <tr>
                <th className="pr-2 text-left font-medium">날짜</th>
                {cumulative.map((line) => (
                  <th key={line.name} className="px-2 font-medium">{line.name}</th>
                ))}
                <th className="pl-2 font-medium">합계</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={label} className="border-t">
                  <td className="pr-2 text-left">{label}</td>
                  {cumulative.map((line) => (
                    <td key={line.name} className="px-2">{fmt(line.values[i] ?? 0)}</td>
                  ))}
                  <td className="pl-2">{fmt(cumulative.reduce((sum, line) => sum + (line.values[i] ?? 0), 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

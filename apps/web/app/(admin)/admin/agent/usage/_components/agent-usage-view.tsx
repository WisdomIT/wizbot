'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

/** 에이전트 사용량 대시보드 (#35 조정 6, pelican UsageStats/Charts 이식) — 최근 30일, 한국 시간 자정 버킷 */

const PERIOD_LABEL = { HOUR: '시간', DAY: '일', WEEK: '주', MONTH: '월' } as const;
const METRIC_LABEL = { TOKENS: '토큰', MESSAGES: '채팅 수' } as const;
const PALETTE = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6b7280'];

export function AgentUsageView() {
  const trpc = useTRPC();
  const { data: overview } = useQuery(trpc.agent.adminOverview.queryOptions());
  const { data: charts } = useQuery(trpc.agent.adminCharts.queryOptions());

  if (!overview || !charts) return <Skeleton className="mt-4 h-96 w-full" />;

  return (
    <div className="flex max-w-4xl flex-col gap-4 py-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="오늘 채팅 수" value={overview.todayMessages.toLocaleString('ko-KR')} />
        <Stat label="오늘 사용 스트리머" value={overview.todayUsers.toLocaleString('ko-KR')} />
        <Stat label="이달 토큰" value={overview.monthTokens.toLocaleString('ko-KR')} />
      </div>

      {/* 전체(GLOBAL) 한도는 한 사용자가 다 써버릴 수 있다 — 관리자는 여기서 그 사실을 본다 */}
      {overview.globalRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">전체 한도 소비</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overview.globalRules.map((rule, index) => {
              const ratio = Math.min(rule.used / rule.amount, 1);
              return (
                <div key={index} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span>
                      {PERIOD_LABEL[rule.period]}당 {METRIC_LABEL[rule.metric]}
                    </span>
                    <span className={ratio >= 1 ? 'font-semibold text-destructive' : ratio >= 0.8 ? 'font-medium text-amber-600' : 'text-muted-foreground'}>
                      {rule.used.toLocaleString('ko-KR')} / {rule.amount.toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div
                      className={ratio >= 1 ? 'h-full bg-destructive' : ratio >= 0.8 ? 'h-full bg-amber-500' : 'h-full bg-primary'}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="일별 채팅 수 (30일)">
          <Bars labels={charts.labels} values={charts.messages} />
        </ChartCard>
        <ChartCard title="일별 토큰 (30일)">
          <Bars labels={charts.labels} values={charts.tokens} />
        </ChartCard>
      </div>

      <ChartCard title="사용자별 누적 토큰 (30일)">
        {charts.series.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">아직 사용 기록이 없습니다.</p>
        ) : (
          <CumulativeLines labels={charts.labels} series={charts.series} />
        )}
      </ChartCard>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold">{value}</span>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Bars({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-36 items-end gap-px">
        {values.map((value, index) => (
          <div
            key={index}
            title={`${labels[index]} · ${value.toLocaleString('ko-KR')}`}
            className="flex-1 rounded-t bg-primary/70"
            style={{ height: `${(value / max) * 100}%`, minHeight: value > 0 ? 2 : 0 }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function CumulativeLines({ labels, series }: { labels: string[]; series: { name: string; values: number[] }[] }) {
  const width = 600;
  const height = 180;
  const max = Math.max(...series.flatMap((line) => line.values), 1);
  const x = (index: number) => (index / (labels.length - 1)) * width;
  const y = (value: number) => height - (value / max) * (height - 8);
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="사용자별 누적 토큰">
        {series.map((line, index) => (
          <polyline
            key={line.name}
            fill="none"
            stroke={PALETTE[index % PALETTE.length]}
            strokeWidth="2"
            points={line.values.map((value, i) => `${x(i)},${y(value)}`).join(' ')}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {series.map((line, index) => (
          <span key={line.name} className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />
            {line.name} ({line.values[line.values.length - 1]?.toLocaleString('ko-KR')})
          </span>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

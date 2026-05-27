"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatCard, SimpleBarChart } from "@/components/ui/Chart";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { fetchUsageStats, type UsageStats } from "@/lib/api";

function ActivityIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchUsageStats();
      setUsage(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <PageLoader message="Loading usage data..." />;

  if (!usage) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Usage</h1>
        <p className="text-sm text-surface-500 mt-1">Monitor your API consumption and quota usage.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total API Calls"
          value={usage.totalCalls}
          icon={<ActivityIcon />}
          variant="default"
        />
        <StatCard
          label="This Month"
          value={usage.callsThisMonth}
          subtitle={`${usage.callsToday.toLocaleString()} today`}
          icon={<CalendarIcon />}
          variant="info"
        />
        <StatCard
          label="Quota Used"
          value={`${usage.quotaPercent}%`}
          subtitle={`${usage.quotaUsed.toLocaleString()} / ${usage.quotaLimit.toLocaleString()}`}
          icon={<ZapIcon />}
          variant={usage.quotaPercent > 80 ? "warning" : "success"}
        />
        <StatCard
          label="Avg Latency"
          value={`${Math.round(usage.byEndpoint.reduce((s, e) => s + e.avgLatency, 0) / usage.byEndpoint.length)}ms`}
          icon={<ClockIcon />}
          variant="default"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Daily Request Volume</h2>
          <SimpleBarChart
            bars={usage.dailyVolume.map((d) => ({
              label: d.date,
              value: d.count,
            }))}
            height={32}
          />
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Quota Consumption</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-surface-600">Monthly quota</span>
                <span className="text-sm font-medium text-surface-900">{usage.quotaPercent}%</span>
              </div>
              <div className="w-full h-3 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${usage.quotaPercent > 80 ? "bg-warning-600" : "bg-brand-500"}`}
                  style={{ width: `${usage.quotaPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-surface-400">{usage.quotaUsed.toLocaleString()} calls</span>
                <span className="text-xs text-surface-400">{usage.quotaLimit.toLocaleString()} calls</span>
              </div>
            </div>

            <div className="p-4 bg-surface-50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <svg className="h-4 w-4 text-info-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <span className="text-xs font-medium text-surface-700">Resets on the 1st of each month</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card padding="md">
        <h2 className="text-lg font-semibold text-surface-900 mb-4">Requests by Endpoint</h2>
        <div className="space-y-1">
          {usage.byEndpoint.map((ep) => {
            const maxCalls = usage.byEndpoint[0].calls;
            const pct = Math.round((ep.calls / maxCalls) * 100);
            return (
              <div key={ep.endpoint} className="flex items-center gap-4 py-2.5 border-b border-surface-100 last:border-0">
                <span className="w-44 shrink-0 text-sm text-surface-700 font-mono text-xs truncate">{ep.endpoint}</span>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="flex-1 h-6 bg-surface-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-surface-700 tabular-nums w-16 text-right shrink-0">
                    {ep.calls.toLocaleString()}
                  </span>
                </div>
                <Badge variant="info" className="shrink-0">{ep.avgLatency}ms</Badge>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

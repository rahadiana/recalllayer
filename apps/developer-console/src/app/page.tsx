"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/Chart";
import { PageLoader } from "@/components/ui/Spinner";
import { SimpleBarChart } from "@/components/ui/Chart";
import { Badge } from "@/components/ui/Badge";
import { fetchDashboardStats, type ConsoleDashboardStats, type UsageStats, fetchUsageStats } from "@/lib/api";

function ActivityIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
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

function ClockIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<ConsoleDashboardStats | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [s, u] = await Promise.all([fetchDashboardStats(), fetchUsageStats()]);
      setStats(s);
      setUsage(u);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <PageLoader message="Loading dashboard..." />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-surface-500 mt-1">Overview of your API usage, keys, and workspace health.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total API Calls"
          value={stats?.totalApiCalls ?? 0}
          subtitle="All-time requests"
          icon={<ActivityIcon />}
          variant="default"
          trend={{ direction: "up", label: "12.4%" }}
        />
        <StatCard
          label="Active API Keys"
          value={`${stats?.activeKeys ?? 0}/${stats?.totalKeys ?? 0}`}
          subtitle="Currently active"
          icon={<KeyIcon />}
          variant="info"
        />
        <StatCard
          label="Quota Usage"
          value={`${stats?.quotaPercent ?? 0}%`}
          subtitle={`${usage?.callsThisMonth.toLocaleString() ?? 0} / ${usage?.quotaLimit.toLocaleString() ?? 0} calls`}
          icon={<ZapIcon />}
          variant={((stats?.quotaPercent ?? 0) > 80) ? "warning" : "success"}
        />
        <StatCard
          label="Avg Latency"
          value={`${stats?.avgLatencyMs ?? 0}ms`}
          subtitle="Last 24 hours"
          icon={<ClockIcon />}
          variant="default"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Weekly Request Volume</h2>
          {usage && (
            <SimpleBarChart
              bars={usage.dailyVolume.map((d) => ({
                label: d.date,
                value: d.count,
              }))}
              height={28}
            />
          )}
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-4">Top Endpoints</h2>
          {usage && (
            <div className="space-y-2">
              {usage.byEndpoint.slice(0, 5).map((ep) => (
                <div key={ep.endpoint} className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">{ep.endpoint}</p>
                    <p className="text-xs text-surface-400">{ep.avgLatency}ms avg</p>
                  </div>
                  <Badge variant="info">{ep.calls.toLocaleString()} calls</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card padding="md">
        <h2 className="text-lg font-semibold text-surface-900 mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/api-keys" className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600 group-hover:bg-brand-200 transition-colors">
              <KeyIcon />
            </div>
            <span className="text-sm font-medium text-surface-700 group-hover:text-surface-900">API Keys</span>
          </a>
          <a href="/usage" className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-100 text-info-600 group-hover:bg-info-200 transition-colors">
              <ActivityIcon />
            </div>
            <span className="text-sm font-medium text-surface-700 group-hover:text-surface-900">Usage</span>
          </a>
          <a href="/logs" className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-100 text-warning-600 group-hover:bg-warning-200 transition-colors">
              <ClockIcon />
            </div>
            <span className="text-sm font-medium text-surface-700 group-hover:text-surface-900">Logs</span>
          </a>
          <a href="/settings" className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-100 text-success-600 group-hover:bg-success-200 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-surface-700 group-hover:text-surface-900">Settings</span>
          </a>
        </div>
      </Card>
    </div>
  );
}

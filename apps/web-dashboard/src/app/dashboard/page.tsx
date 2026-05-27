"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageLoader } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { SearchBar } from "@/components/search/SearchComponents";
import { fetchDashboardStats, fetchDocuments, type DashboardStats } from "@/lib/api";
import type { Document } from "@memory-platform/shared-schemas";

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [s, docs] = await Promise.all([fetchDashboardStats(), fetchDocuments({ limit: 5 })]);
      setStats(s);
      setRecentDocs(docs.items);
      setLoading(false);
    }
    load();
  }, []);

  const handleQuickSearch = (query: string) => {
    setSearching(true);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  if (loading) return <PageLoader message="Loading dashboard..." />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-surface-500 mt-1">Overview of your memory platform.</p>
      </div>

      <div className="mb-6">
        <SearchBar onSearch={handleQuickSearch} loading={searching} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Documents" value={stats?.totalDocuments ?? 0} icon={<DocIcon />} color="brand" />
        <StatCard label="Ready Documents" value={stats?.readyDocuments ?? 0} icon={<CheckIcon />} color="success" />
        <StatCard label="Total Chunks" value={stats?.totalChunks ?? 0} icon={<LayersIcon />} color="warning" />
        <StatCard label="Active Connectors" value={stats?.activeConnectors ?? 0} icon={<LinkIcon />} color="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-900">Recent Documents</h2>
              <button onClick={() => router.push("/documents")} className="text-sm text-brand-600 hover:text-brand-700 font-medium">View all</button>
            </div>
            <div className="space-y-2">
              {recentDocs.map((doc) => (
                <div key={doc.id} onClick={() => router.push(`/documents`)} className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-50 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{doc.title}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{doc.source.type} · {doc.chunk_count ?? 0} chunks</p>
                  </div>
                  <Badge variant={doc.status === "ready" ? "success" : doc.status === "error" ? "error" : "warning"}>
                    {doc.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div>
          <Card padding="md">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">Quick Links</h2>
            <div className="space-y-2">
              <button onClick={() => router.push("/documents/upload")} className="w-full text-left p-3 rounded-lg hover:bg-surface-50 transition-colors">
                <p className="text-sm font-medium text-surface-900">Upload Document</p>
                <p className="text-xs text-surface-400">Add new content to your memory</p>
              </button>
              <button onClick={() => router.push("/search")} className="w-full text-left p-3 rounded-lg hover:bg-surface-50 transition-colors">
                <p className="text-sm font-medium text-surface-900">Search Memory</p>
                <p className="text-xs text-surface-400">Query your knowledge base</p>
              </button>
              <button onClick={() => router.push("/connectors")} className="w-full text-left p-3 rounded-lg hover:bg-surface-50 transition-colors">
                <p className="text-sm font-medium text-surface-900">Connectors</p>
                <p className="text-xs text-surface-400">Manage external data sources</p>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = { brand: "text-brand-600 bg-brand-50", success: "text-success-600 bg-success-50", warning: "text-warning-600 bg-warning-50", info: "text-info-600 bg-info-50" };
  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-surface-200 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors[color] || colors.brand}`}>{icon}</div>
      <div><p className="text-2xl font-bold text-surface-900">{value}</p><p className="text-xs text-surface-500">{label}</p></div>
    </div>
  );
}

function DocIcon() { return (<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>); }
function CheckIcon() { return (<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>); }
function LayersIcon() { return (<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" /></svg>); }
function LinkIcon() { return (<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>); }

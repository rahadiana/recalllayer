"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Table, Pagination } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/Spinner";
import { fetchRequestLogs, type RequestLogEntry } from "@/lib/api";

function statusColor(status: number): "success" | "warning" | "error" | "default" {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "warning";
  if (status >= 500) return "error";
  return "default";
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function LogsPage() {
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | undefined>();
  const [filterEndpoint, setFilterEndpoint] = useState("");

  const loadLogs = useCallback(async (cursorVal?: string) => {
    setLoading(true);
    try {
      const result = await fetchRequestLogs({ limit: 50, cursor: cursorVal });
      setLogs(result.items);
      setNextCursor(result.next_cursor);
      setTotal(result.total);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = filterEndpoint
    ? logs.filter((l) => l.endpoint.toLowerCase().includes(filterEndpoint.toLowerCase()))
    : logs;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Request Logs</h1>
          <p className="text-sm text-surface-500 mt-1">
            {total != null ? `${total.toLocaleString()} total requests` : "Recent API requests"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => loadLogs()} loading={loading}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Refresh
        </Button>
      </div>

      <Card padding="none">
        <div className="p-4 border-b border-surface-200">
          <Input
            placeholder="Filter by endpoint..."
            value={filterEndpoint}
            onChange={(e) => setFilterEndpoint(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Table
          data={filtered}
          keyField="id"
          loading={loading}
          emptyMessage="No request logs found."
          columns={[
            {
              key: "timestamp",
              label: "Timestamp",
              render: (log: RequestLogEntry) => (
                <span className="text-xs text-surface-500 whitespace-nowrap">{formatTime(log.timestamp)}</span>
              ),
            },
            {
              key: "endpoint",
              label: "Endpoint",
              render: (log: RequestLogEntry) => (
                <div>
                  <span className="text-xs font-mono text-surface-700 bg-surface-100 rounded px-1.5 py-0.5">
                    {log.method}
                  </span>
                  <span className="text-sm text-surface-700 ml-2 font-mono">{log.endpoint}</span>
                </div>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (log: RequestLogEntry) => (
                <Badge variant={statusColor(log.status)}>{log.status}</Badge>
              ),
            },
            {
              key: "latency_ms",
              label: "Latency",
              render: (log: RequestLogEntry) => {
                const slow = log.latency_ms > 150;
                return (
                  <span className={`text-sm tabular-nums ${slow ? "text-warning-600 font-medium" : "text-surface-600"}`}>
                    {log.latency_ms}ms
                  </span>
                );
              },
            },
            {
              key: "api_key_id",
              label: "API Key",
              render: (log: RequestLogEntry) => (
                <span className="text-xs text-surface-400 font-mono">{log.api_key_id}</span>
              ),
            },
          ]}
        />
      </Card>

      <Pagination
        hasNext={nextCursor !== null}
        hasPrev={cursor !== null}
        onNext={() => {
          if (nextCursor) {
            setCursor(nextCursor);
            loadLogs(nextCursor);
          }
        }}
        onPrev={() => {
          setCursor(null);
          loadLogs();
        }}
        total={total}
        currentLabel={cursor ? "Next Page" : "Page 1"}
      />
    </div>
  );
}

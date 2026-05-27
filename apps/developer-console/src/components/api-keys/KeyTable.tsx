"use client";

import { Table, Badge } from "@/components/ui";
import type { ApiKey } from "@memory-platform/shared-schemas";

interface KeyTableProps {
  keys: ApiKey[];
  loading?: boolean;
  onRevoke?: (key: ApiKey) => void;
  onCopy?: (key: ApiKey) => void;
}

function formatDate(ts?: string): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KeyTable({ keys, loading, onRevoke, onCopy }: KeyTableProps) {
  return (
    <Table
      data={keys}
      keyField="id"
      loading={loading}
      emptyMessage="No API keys found. Create your first key to get started."
      columns={[
        {
          key: "label",
          label: "Name",
          render: (key: ApiKey) => (
            <div>
              <p className="text-sm font-medium text-surface-900">{key.label ?? "Unnamed Key"}</p>
              <p className="text-xs text-surface-400 font-mono">{key.prefix}...</p>
            </div>
          ),
        },
        {
          key: "permissions",
          label: "Permissions",
          render: (key: ApiKey) => (
            <div className="flex flex-wrap gap-1 max-w-48">
              {key.permissions.slice(0, 2).map((p) => (
                <Badge key={p} variant="info">
                  {p}
                </Badge>
              ))}
              {key.permissions.length > 2 && (
                <Badge variant="default">+{key.permissions.length - 2}</Badge>
              )}
            </div>
          ),
        },
        {
          key: "created_at",
          label: "Created",
          render: (key: ApiKey) => (
            <span className="text-xs text-surface-500">{formatDate(key.created_at)}</span>
          ),
        },
        {
          key: "last_used_at",
          label: "Last Used",
          render: (key: ApiKey) => (
            <span className="text-xs text-surface-500">{formatDate(key.last_used_at)}</span>
          ),
        },
        {
          key: "is_active",
          label: "Status",
          render: (key: ApiKey) => (
            <Badge variant={key.is_active ? "success" : "error"}>
              {key.is_active ? "Active" : "Revoked"}
            </Badge>
          ),
        },
        {
          key: "actions",
          label: "",
          className: "w-24",
          render: (key: ApiKey) => (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy?.(key);
                }}
                className="p-1.5 text-surface-400 hover:text-brand-600 rounded-md hover:bg-brand-50 transition-colors"
                title="Copy key prefix"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              </button>
              {key.is_active && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevoke?.(key);
                  }}
                  className="p-1.5 text-surface-400 hover:text-error-600 rounded-md hover:bg-error-50 transition-colors"
                  title="Revoke key"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

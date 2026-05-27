"use client";

import { Table, Pagination } from "../ui/Table";
import { StatusBadge } from "../ui/Badge";
import type { Document } from "@memory-platform/shared-schemas";

export function DocumentTable({
  documents,
  loading,
  onRowClick,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  total,
}: {
  documents: Document[];
  loading: boolean;
  onRowClick?: (doc: Document) => void;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  total?: number;
}) {
  return (
    <div className="space-y-4">
      <Table
        data={documents}
        keyField="id"
        loading={loading}
        emptyMessage="No documents found. Upload your first document to get started."
        onRowClick={onRowClick}
        columns={[
          {
            key: "title",
            label: "Title",
            className: "max-w-[300px]",
            render: (doc: Document) => (
              <div>
                <p className="font-medium text-surface-900 truncate">{doc.title}</p>
                {doc.description && (
                  <p className="text-xs text-surface-400 truncate mt-0.5">{doc.description}</p>
                )}
              </div>
            ),
          },
          {
            key: "status",
            label: "Status",
            render: (doc: Document) => <StatusBadge status={doc.status} />,
          },
          {
            key: "source",
            label: "Source",
            render: (doc: Document) => (
              <span className="text-xs text-surface-500 capitalize">{doc.source.type}</span>
            ),
          },
          {
            key: "tags",
            label: "Tags",
            render: (doc: Document) => (
              <div className="flex flex-wrap gap-1">
                {doc.tags.slice(0, 2).map((tag: string) => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-surface-100 text-xs text-surface-500">
                    {tag}
                  </span>
                ))}
                {doc.tags.length > 2 && (
                  <span className="text-xs text-surface-400">+{doc.tags.length - 2}</span>
                )}
              </div>
            ),
          },
          {
            key: "chunks",
            label: "Chunks",
            render: (doc: Document) => (
              <span className="text-xs text-surface-500 tabular-nums">
                {doc.chunk_count ?? "—"}
              </span>
            ),
          },
          {
            key: "updated",
            label: "Updated",
            render: (doc: Document) => (
              <span className="text-xs text-surface-400 tabular-nums whitespace-nowrap">
                {formatDate(doc.updated_at)}
              </span>
            ),
          },
        ]}
      />
      <Pagination
        hasNext={hasNext}
        hasPrev={hasPrev}
        onNext={onNext}
        onPrev={onPrev}
        total={total}
      />
    </div>
  );
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

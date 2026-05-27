"use client";

import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  label: string;
  className?: string;
  render?: (item: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (item: T) => void;
}

export function Table<T>({
  columns,
  data,
  keyField,
  emptyMessage = "No data found.",
  loading = false,
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-surface-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-200 bg-surface-50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-medium text-surface-500 text-xs uppercase tracking-wider ${col.className ?? ""}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-surface-100 last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 bg-surface-100 rounded animate-pulse" style={{ width: `${60 + ((i * 7 + col.key.length * 13) % 30)}%` }} />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-surface-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, idx) => {
              const itemRecord = item as Record<string, unknown>;
              return (
                <tr
                  key={String(item[keyField])}
                  className={`
                    border-b border-surface-100 last:border-0 transition-colors duration-100
                    ${onRowClick ? "cursor-pointer hover:bg-surface-50" : ""}
                    ${idx % 2 === 0 ? "bg-white" : "bg-surface-50/40"}
                  `.trim()}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-surface-700 ${col.className ?? ""}`}>
                      {col.render ? col.render(item) : String(itemRecord[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  total,
  currentLabel = "Page 1",
}: {
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  total?: number;
  currentLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-surface-500">
        {total != null ? `${total} total items` : ""}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-surface-300 bg-white text-surface-700 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <span className="text-sm text-surface-500 px-2">{currentLabel}</span>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-surface-300 bg-white text-surface-700 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

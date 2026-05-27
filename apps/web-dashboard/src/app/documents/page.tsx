"use client";

import { useEffect, useState, useCallback } from "react";
import { PageLoader } from "@/components/ui/Spinner";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { fetchDocuments } from "@/lib/api";
import type { Document } from "@memory-platform/shared-schemas";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 10;

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    const result = await fetchDocuments({
      limit,
      cursor: page > 0 ? String(page) : undefined,
      status: statusFilter || undefined,
      search: search || undefined,
    });
    setDocuments(result.items);
    setHasMore(result.next_cursor != null);
    setLoading(false);
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Documents</h1>
          <p className="text-sm text-surface-500 mt-1">Manage your ingested documents.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-surface-300 bg-white placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.currentTarget.value); setPage(0); }}
          className="px-3 py-2 text-sm rounded-lg border border-surface-300 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        >
          <option value="">All Status</option>
          <option value="ready">Ready</option>
          <option value="pending">Pending</option>
          <option value="ingesting">Ingesting</option>
          <option value="extracting">Extracting</option>
          <option value="chunking">Chunking</option>
          <option value="indexing">Indexing</option>
          <option value="error">Error</option>
        </select>
      </div>

      <DocumentTable
        documents={documents}
        loading={loading}
        hasNext={hasMore}
        hasPrev={page > 0}
        onNext={() => setPage((p) => p + 1)}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        total={documents.length}
      />
    </div>
  );
}

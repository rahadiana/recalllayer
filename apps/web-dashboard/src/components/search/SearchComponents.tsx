"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { searchMemory, type SearchPayload } from "@/lib/api";
import type { SearchResponse, SearchResult } from "@memory-platform/shared-schemas";

export function SearchBar({
  onSearch,
  loading,
}: {
  onSearch: (query: string) => void;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <div className="relative flex-1">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search your memory... (press "/" to focus)'
          className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-surface-300 bg-white placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
        />
      </div>
      <Button type="submit" loading={loading} size="lg">
        Search
      </Button>
    </form>
  );
}

export function SearchResults({ response }: { response: SearchResponse }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-surface-500">
          {response.total_hits} results in {response.latency_ms}ms
        </p>
      </div>
      <div className="space-y-3">
        {response.results.map((result) => (
          <ResultCard key={result.chunk_id} result={result} />
        ))}
      </div>
    </div>
  );
}

export function ResultCard({ result }: { result: SearchResult }) {
  return (
    <Card padding="md" className="hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-brand-600 mb-1">
            Document {String(result.document_id).substring(0, 8)}...
          </p>
          <p className="text-sm text-surface-700 leading-relaxed line-clamp-4">
            {result.text}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge variant={result.score > 0.8 ? "success" : result.score > 0.6 ? "warning" : "default"}>
            {(result.score * 100).toFixed(0)}%
          </Badge>
          <span className="text-xs text-surface-400">Rank #{result.rank}</span>
        </div>
      </div>
      {result.source_scores && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-surface-100">
          {result.source_scores.vector != null && (
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Vector: {(result.source_scores.vector * 100).toFixed(0)}%
            </div>
          )}
          {result.source_scores.keyword != null && (
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <span className="h-1.5 w-1.5 rounded-full bg-warning-500" />
              Keyword: {(result.source_scores.keyword * 100).toFixed(0)}%
            </div>
          )}
        </div>
      )}
      {result.metadata && Object.keys(result.metadata).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {Object.entries(result.metadata).map(([k, v]) => (
            <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-100 text-xs text-surface-500 font-mono">
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export function FilterPanel({
  tags,
  selectedTags,
  onToggleTag,
  dateRange,
  onDateRangeChange,
}: {
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  dateRange: { after: string; before: string };
  onDateRangeChange: (range: { after: string; before: string }) => void;
}) {
  return (
    <Card padding="md" className="space-y-4">
      <h3 className="text-sm font-semibold text-surface-900">Filters</h3>

      {tags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-surface-500 mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onToggleTag(tag)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${selectedTags.includes(tag) ? "bg-brand-100 text-brand-700 border border-brand-300" : "bg-surface-100 text-surface-600 border border-transparent hover:bg-surface-200"}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-surface-500 mb-2">Date Range</p>
        <div className="space-y-2">
          <input
            type="date"
            value={dateRange.after}
            onChange={(e) => onDateRangeChange({ ...dateRange, after: e.target.value })}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-surface-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20 focus:border-brand-500"
          />
          <input
            type="date"
            value={dateRange.before}
            onChange={(e) => onDateRangeChange({ ...dateRange, before: e.target.value })}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-surface-300 focus:outline-none focus:ring-1 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>
    </Card>
  );
}

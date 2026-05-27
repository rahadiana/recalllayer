"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar, SearchResults, FilterPanel } from "@/components/search/SearchComponents";
import { PageLoader } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { searchMemory, type SearchPayload } from "@/lib/api";
import type { SearchResponse } from "@memory-platform/shared-schemas";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ after: "", before: "" });

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    setQuery(q);

    const payload: SearchPayload = {
      query: q,
      top_k: 20,
      similarity_threshold: 0.3,
      hybrid: true,
    };

    if (selectedTags.length > 0) {
      payload.filters = { ...payload.filters, tags: selectedTags };
    }
    if (dateRange.after) {
      payload.filters = { ...payload.filters, created_after: new Date(dateRange.after).toISOString() };
    }
    if (dateRange.before) {
      payload.filters = { ...payload.filters, created_before: new Date(dateRange.before).toISOString() };
    }

    try {
      const resp = await searchMemory(payload);
      setResponse(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [selectedTags, dateRange]);

  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery);
    }
  }, [initialQuery]);

  const availableTags = [
    "product", "requirements", "architecture", "api", "design",
    "research", "ux", "connectors", "integration", "security",
    "auth", "onboarding", "dev", "database", "reference",
    "planning", "okrs",
  ];

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Search Memory</h1>
        <p className="text-sm text-surface-500 mt-1">
          Search across all your documents using natural language.
        </p>
      </div>

      <SearchBar onSearch={doSearch} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <FilterPanel
            tags={availableTags}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
          />
        </div>

        <div className="lg:col-span-3">
          {loading ? (
            <PageLoader message="Searching your memory..." />
          ) : error ? (
            <Card padding="md" className="text-center">
              <p className="text-sm text-error-600">{error}</p>
            </Card>
          ) : response ? (
            <SearchResults response={response} />
          ) : (
            <Card padding="md" className="text-center py-16">
              <svg className="mx-auto h-12 w-12 text-surface-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <h3 className="text-lg font-medium text-surface-700 mb-1">Search your memory</h3>
              <p className="text-sm text-surface-400 max-w-md mx-auto">
                Type a query above to find relevant content across all your documents. Use natural language for best results.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

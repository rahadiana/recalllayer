"use client";

import Link from "next/link";

const architectureLayers = [
  {
    label: "Ingestion",
    description: "Multi-source document intake — API, file upload, connectors",
    accent: "from-brand-500/20 to-brand-600/10",
    dot: "bg-brand-500",
  },
  {
    label: "Extraction",
    description: "Structured text & metadata extraction pipeline",
    accent: "from-brand-400/20 to-brand-500/10",
    dot: "bg-brand-400",
  },
  {
    label: "Indexing",
    description: "Chunking, embedding, and vector index management",
    accent: "from-brand-300/20 to-brand-400/10",
    dot: "bg-brand-300",
  },
  {
    label: "Retrieval",
    description: "Hybrid search with semantic reranking & context assembly",
    accent: "from-brand-200/20 to-brand-300/10",
    dot: "bg-brand-200",
  },
  {
    label: "Memory Graph",
    description: "Entity-relation mapping with persistent knowledge graphs",
    accent: "from-brand-100/20 to-brand-200/10",
    dot: "bg-brand-100",
  },
];

function ArchitectureVisual() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      {/* Background decorative grid */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #4f46e5 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Central vertical connecting spine */}
      <div className="absolute left-6 top-4 bottom-4 w-px bg-gradient-to-b from-brand-200/60 via-brand-400/30 to-brand-200/60" />

      <div className="space-y-5">
        {architectureLayers.map((layer, i) => (
          <div
            key={layer.label}
            className="relative"
            style={{ paddingLeft: `${i * 16 + 48}px` }}
          >
            {/* Connector dot on spine */}
            <div
              className={`absolute left-6 top-5 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-white shadow-sm ${layer.dot}`}
            />

            {/* Horizontal connector line */}
            <div
              className="absolute left-6 top-5 h-px bg-gradient-to-r from-brand-200/40 to-transparent"
              style={{ width: `${i * 16 + 12}px` }}
            />

            {/* Layer card */}
            <div
              className={`
                relative rounded-xl border border-surface-200 bg-white/80
                backdrop-blur-sm p-4 shadow-sm
                transition-all duration-200 hover:shadow-md hover:border-brand-200
              `}
            >
              <div
                className={`absolute inset-0 rounded-xl bg-gradient-to-br ${layer.accent} opacity-0 transition-opacity duration-300 hover:opacity-100`}
              />
              <div className="relative">
                <h3 className="text-sm font-semibold text-surface-900 tracking-tight">
                  {layer.label}
                </h3>
                <p className="mt-1 text-xs text-surface-400 leading-relaxed">
                  {layer.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: API Gateway anchor */}
      <div className="mt-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-brand-300/30 to-transparent" />
        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/80 px-4 py-2 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-brand-600" />
          <span className="text-xs font-semibold text-brand-700 tracking-tight">
            API Gateway
          </span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-l from-brand-300/30 to-transparent" />
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* Decorative ambient gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-50/50 via-white to-surface-50/40" />
      <div className="absolute top-0 right-0 h-[600px] w-[600px] -translate-y-1/2 translate-x-1/4 rounded-full bg-brand-100/20 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-[400px] w-[400px] translate-y-1/3 -translate-x-1/4 rounded-full bg-brand-50/30 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-28 lg:flex lg:items-center lg:gap-24 lg:px-8 lg:py-32">
        {/* LEFT: Copy */}
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-xl lg:flex-shrink-0">
          {/* Status badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 border border-brand-100/60">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            <span className="text-xs font-semibold text-brand-700 tracking-wide uppercase">
              Public Beta
            </span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-surface-900 sm:text-5xl lg:text-6xl/[1.1]">
            Recall{" "}
            <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
              Platform
            </span>
          </h1>

          <p className="mt-6 text-base text-surface-500 leading-relaxed sm:text-lg max-w-lg">
            The memory layer for AI agents — ingest, index, and retrieve
            knowledge at scale with hybrid search, memory graphs, and connector
            synchronization. Purpose-built for production agentic workflows.
          </p>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-base font-medium text-white shadow-sm transition-all duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Get Started
              <ArrowRight />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 bg-white px-6 py-3 text-base font-medium text-surface-700 transition-all duration-150 hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-400 focus-visible:ring-offset-2"
            >
              Read the Docs
              <ExternalLink />
            </Link>
          </div>

          <p className="mt-6 text-sm text-surface-400">
            No credit card required. Free tier available with 1K documents.
          </p>
        </div>

        {/* RIGHT: Architecture Visual */}
        <div className="mt-20 lg:mt-0 lg:flex-1">
          <ArchitectureVisual />
        </div>
      </div>
    </section>
  );
}

function ArrowRight() {
  return (
    <svg
      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
      />
    </svg>
  );
}

function ExternalLink() {
  return (
    <svg
      className="h-4 w-4 text-surface-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

import type { ReactNode } from "react";

interface Feature {
  title: string;
  description: string;
  icon: ReactNode;
  accentClass: string;
}

const features: Feature[] = [
  {
    title: "Hybrid Search",
    description:
      "Combine vector similarity with keyword retrieval and cross-encoder reranking for precise, production-grade search.",
    icon: <SearchIcon />,
    accentClass: "group-hover:border-brand-300 group-hover:shadow-brand-100/40",
  },
  {
    title: "Ingestion Pipeline",
    description:
      "Automated document ingestion with extraction, intelligent chunking, embedding generation, and vector indexing.",
    icon: <IngestionIcon />,
    accentClass: "group-hover:border-success-300 group-hover:shadow-success-100/40",
  },
  {
    title: "Memory Graph",
    description:
      "Entity and relationship graph backed by Neo4j. Connect knowledge across documents for deeper retrieval.",
    icon: <GraphIcon />,
    accentClass: "group-hover:border-warning-300 group-hover:shadow-warning-100/40",
  },
  {
    title: "Context Assembly",
    description:
      "Assemble ranked, deduplicated context windows from multiple sources, ready for LLM consumption.",
    icon: <AssemblyIcon />,
    accentClass: "group-hover:border-info-300 group-hover:shadow-info-100/40",
  },
  {
    title: "SDKs & APIs",
    description:
      "TypeScript SDK, React hooks, and REST API with typed contracts so you can integrate with any stack.",
    icon: <SdkIcon />,
    accentClass: "group-hover:border-brand-300 group-hover:shadow-brand-100/40",
  },
  {
    title: "Production Controls",
    description:
      "Rate limiting, API-key auth, OpenTelemetry observability, and usage analytics built in from day one.",
    icon: <ControlsIcon />,
    accentClass: "group-hover:border-success-300 group-hover:shadow-success-100/40",
  },
];

export default function Features() {
  return (
    <section className="py-16 sm:py-24">
      <div className="text-center mb-12 sm:mb-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 tracking-tight">
          Everything your agents need to remember
        </h2>
        <p className="mt-3 text-sm sm:text-base text-surface-500 max-w-2xl mx-auto">
          A complete memory layer — from ingestion to retrieval, with graph-backed context and
          production-ready infrastructure.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature) => (
          <div
            key={feature.title}
            className={`
              group relative rounded-xl border border-surface-200 bg-white
              p-6 transition-all duration-300 ease-out
              hover:-translate-y-1 hover:shadow-lg
              ${feature.accentClass}
            `}
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-100 text-surface-500 transition-colors duration-300 group-hover:bg-brand-50 group-hover:text-brand-600">
              {feature.icon}
            </div>

            <h3 className="text-base font-semibold text-surface-900 mb-2">
              {feature.title}
            </h3>

            <p className="text-sm text-surface-500 leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function IngestionIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
      />
    </svg>
  );
}

function AssemblyIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
      />
    </svg>
  );
}

function SdkIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
      />
    </svg>
  );
}

function ControlsIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

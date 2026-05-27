import type { ReactNode } from "react";

interface Step {
  number: number;
  label: string;
  title: string;
  description: string;
  icon: ReactNode;
}

const steps: Step[] = [
  {
    number: 1,
    label: "Step 1",
    title: "Ingest",
    description:
      "Upload documents, connect external sources via Notion or API, or stream data directly from your agents. The ingestion pipeline validates, deduplicates, and stores every piece of content ready for processing.",
    icon: <IngestIcon />,
  },
  {
    number: 2,
    label: "Step 2",
    title: "Index",
    description:
      "Content is chunked, embedded with state-of-the-art vector models, and indexed across both dense and sparse retrieval paths. Entity extraction builds a rich knowledge graph for deeper context understanding.",
    icon: <IndexIcon />,
  },
  {
    number: 3,
    label: "Step 3",
    title: "Retrieve",
    description:
      "Hybrid search combines semantic vector matching with keyword relevance, reranked for precision. Assembled context is delivered to your AI agents as structured, citation-backed responses in milliseconds.",
    icon: <RetrieveIcon />,
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold tracking-widest uppercase text-brand-600 mb-3">
            How It Works
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-surface-900 sm:text-4xl">
            From raw data to intelligent memory in three steps
          </h2>
          <p className="mt-4 text-base text-surface-500 leading-relaxed">
            The Memory Platform pipeline turns unstructured content into searchable,
            context-rich knowledge your AI agents can rely on.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10">
          {steps.map((step, idx) => (
            <div key={step.number} className="relative group">
              <div className="relative rounded-2xl border border-surface-200 bg-white p-8 shadow-sm transition-shadow duration-300 hover:shadow-lg">
                <div className="flex items-center gap-3 mb-6">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
                    {step.number}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest text-surface-400">
                    {step.label}
                  </span>
                </div>

                <div className="mb-5 text-brand-600">{step.icon}</div>

                <h3 className="text-xl font-semibold text-surface-900 mb-3">
                  {step.title}
                </h3>
                <p className="text-sm text-surface-500 leading-relaxed">
                  {step.description}
                </p>
              </div>

              {idx < steps.length - 1 && (
                <div className="hidden md:block absolute -right-5 top-1/2 -translate-y-1/2 z-10">
                  <svg
                    className="h-8 w-8 text-surface-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


function IngestIcon() {
  return (
    <svg
      className="h-8 w-8"
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

function IndexIcon() {
  return (
    <svg
      className="h-8 w-8"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}

function RetrieveIcon() {
  return (
    <svg
      className="h-8 w-8"
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

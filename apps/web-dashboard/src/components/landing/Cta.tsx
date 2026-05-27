import Link from "next/link";

export function Cta() {
  return (
    <section className="relative overflow-hidden bg-surface-900 py-20 lg:py-28">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-900/30 via-surface-900 to-surface-950" />
      <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-brand-600/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-brand-500/5 blur-3xl" />

      <div className="relative max-w-3xl mx-auto px-6 lg:px-8 text-center">
        <p className="text-sm font-semibold tracking-widest uppercase text-brand-400 mb-4">
          Start Building
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
          Ready to give your agents a memory?
        </h2>
        <p className="mt-6 text-base text-surface-300 leading-relaxed max-w-xl mx-auto">
          Connect your data, index your knowledge, and retrieve context in real time.
          Free to start, scales with your needs.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-600/25 transition-all duration-200 hover:bg-brand-500 hover:shadow-brand-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900"
          >
            Get Started Free
            <svg
              className="ml-2 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-xl border border-surface-600 bg-transparent px-8 py-3.5 text-base font-semibold text-surface-200 transition-all duration-200 hover:border-surface-400 hover:text-white hover:bg-surface-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900"
          >
            Read the Docs
            <svg
              className="ml-2 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </Link>
        </div>

        <p className="mt-8 text-xs text-surface-500">
          No credit card required · Free tier includes 1,000 documents
        </p>
      </div>
    </section>
  );
}

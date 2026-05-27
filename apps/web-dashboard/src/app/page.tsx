import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Cta } from "@/components/landing/Cta";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-surface-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">M</div>
            <span className="text-lg font-semibold text-surface-900">RecallLayer</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-sm font-medium text-surface-600 transition-colors hover:text-surface-900">Docs</Link>
            <Link href="/login" className="text-sm font-medium text-surface-600 transition-colors hover:text-surface-900">Sign In</Link>
            <Link href="/signup" className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-700 hover:shadow-md">Get Started</Link>
          </div>
        </div>
      </header>
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Cta />
      </main>
      <footer className="border-t border-surface-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-brand-600 text-xs font-bold text-white">M</div>
              <span className="text-sm font-medium text-surface-600">RecallLayer</span>
            </div>
            <p className="text-xs text-surface-400">&copy; {new Date().getFullYear()} RecallLayer. Built for AI agents.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

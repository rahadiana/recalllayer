import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <p className="text-8xl font-bold text-surface-100 select-none mb-4">404</p>
      <h2 className="text-xl font-semibold text-surface-900 mb-2">Page not found</h2>
      <p className="text-sm text-surface-500 mb-6">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors shadow-sm"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}

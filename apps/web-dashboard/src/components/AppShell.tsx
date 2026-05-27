"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, Header } from "@/components/ui/Layout";
import AuthGuard from "@/components/AuthGuard";

const PUBLIC_PATHS = ["/login", "/signup", "/docs", "/landing"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <main className="min-h-screen bg-surface-50">{children}</main>;
  }

  const isPublic = pathname === "/" || PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <Sidebar />
      <Header />
      <main className="ml-64 pt-16">
        <div className="px-8 py-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </AuthGuard>
  );
}

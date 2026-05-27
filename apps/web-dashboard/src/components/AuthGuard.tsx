"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

function getApiKey(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)api_key=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = getApiKey();
    if (!key && pathname !== "/login") {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [pathname, router]);

  if (pathname === "/login") return <>{children}</>;
  if (!ready) return null;
  return <>{children}</>;
}

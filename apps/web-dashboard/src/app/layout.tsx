import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallLayer",
  description: "Long-term memory for AI agents — upload, search, and manage your knowledge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-50">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

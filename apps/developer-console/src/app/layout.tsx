import type { Metadata } from "next";
import { Sidebar, Header } from "@/components/ui/Layout";
import AuthGuard from "@/components/AuthGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Developer Console — RecallLayer",
  description: "Manage API keys, monitor usage, view request logs, and configure workspace settings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-50">
        <AuthGuard>
        <Sidebar />
        <Header />
        <main className="ml-64 pt-16">
          <div className="px-8 py-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
        </AuthGuard>
      </body>
    </html>
  );
}

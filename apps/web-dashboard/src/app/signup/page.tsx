"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
}

function randomToken(len = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function normalizeWorkspace(input: string) {
  const slug = input.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
  return slug || "workspace123abc";
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");

  const ws = useMemo(() => normalizeWorkspace(workspace), [workspace]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    if (!email.includes("@")) return setError("Valid email is required");

    const key = `ak_${ws}_${randomToken(28)}`;
    setGeneratedKey(key);
    setError("");
  }

  function finishSetup() {
    setCookie("api_key", generatedKey, 30);
    setCookie("workspace_id", ws, 30);
    router.push("/dashboard");
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(generatedKey);
    } catch {}
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-xl mb-4">M</div>
          <h1 className="text-2xl font-bold text-surface-900">Create your workspace</h1>
          <p className="text-sm text-surface-500 mt-2">Set up your RecallLayer workspace in under a minute.</p>
        </div>

        {!generatedKey ? (
          <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl shadow-sm border border-surface-200 space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
              <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Jane Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="jane@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Workspace ID</label>
              <input value={workspace} onChange={(e) => { setWorkspace(e.target.value); setError(""); }} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="clientAlpha" />
              <p className="text-xs text-surface-400 mt-1">Will be normalized to: <code>{ws}</code></p>
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

            <button type="submit" className="w-full py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">Create Workspace</button>
          </form>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-surface-200 space-y-4">
            <h2 className="text-lg font-semibold text-surface-900">Your API key is ready</h2>
            <p className="text-sm text-surface-500">Save this key now. You will use it for dashboard and API access.</p>
            <div className="p-3 bg-surface-100 rounded-lg border border-surface-200">
              <code className="text-xs break-all text-surface-700">{generatedKey}</code>
            </div>
            <div className="flex gap-2">
              <button onClick={copyKey} className="flex-1 py-2.5 border border-surface-300 rounded-lg text-sm font-medium text-surface-700 hover:bg-surface-50">Copy Key</button>
              <button onClick={finishSetup} className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">Go to Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + days * 86400000);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
}

export default function LoginPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (trimmed.length < 16) {
      setError("API key terlalu pendek (min 16 karakter)");
      return;
    }
    if (!trimmed.match(/^(ak|sk)_/)) {
      setError('Format salah. Harus diawali "ak_" atau "sk_"');
      return;
    }
    setCookie("api_key", trimmed, 30);
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-xl mb-4">M</div>
          <h1 className="text-2xl font-bold text-surface-900">RecallLayer</h1>
          <p className="text-sm text-surface-500 mt-2">Developer Console — masuk dengan API key</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white p-6 rounded-xl shadow-sm border border-surface-200 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">API Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(""); }}
              placeholder="ak_workspace_xxxxxxxxx"
              className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              autoFocus
            />
            <p className="text-xs text-surface-400 mt-1">Format: ak_&lt;workspace_id&gt;_&lt;random&gt;</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Masuk
          </button>
        </form>

        <p className="text-xs text-surface-400 text-center mt-4">
          Use your workspace API key (`ak_&lt;workspace_id&gt;_&lt;token&gt;`).
        </p>
      </div>
    </div>
  );
}

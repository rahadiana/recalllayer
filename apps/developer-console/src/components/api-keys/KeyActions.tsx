"use client";

import { useState } from "react";

interface KeyActionsProps {
  rawKey: string;
  onClose: () => void;
}

export function KeyActions({ rawKey, onClose }: KeyActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.createElement("textarea");
      el.value = rawKey;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-warning-50 border border-warning-100 rounded-lg">
        <div className="flex items-start gap-2">
          <svg className="h-5 w-5 text-warning-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-warning-700">Save this key securely</p>
            <p className="text-xs text-warning-600 mt-1">
              You will not be able to see this key again. Store it in a secure location.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2.5 bg-surface-100 rounded-lg text-sm font-mono text-surface-700 break-all select-all">
          {rawKey}
        </code>
        <button
          onClick={handleCopy}
          className={`
            shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
            ${copied
              ? "bg-success-100 text-success-700"
              : "bg-brand-600 text-white hover:bg-brand-700"
            }
          `.trim()}
        >
          {copied ? (
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copy
            </span>
          )}
        </button>
      </div>

      <button
        onClick={onClose}
        className="w-full py-2.5 text-sm font-medium text-surface-500 hover:text-surface-700 bg-surface-100 hover:bg-surface-200 rounded-lg transition-colors"
      >
        I have saved my key
      </button>
    </div>
  );
}

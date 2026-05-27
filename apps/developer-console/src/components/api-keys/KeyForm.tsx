"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { Button } from "@/components/ui";

interface KeyFormProps {
  onSubmit: (data: { label: string; permissions: string[]; expires_at?: string }) => Promise<void>;
  onCancel: () => void;
}

const availablePermissions = [
  "document:read",
  "document:write",
  "search:query",
  "profile:read",
  "profile:write",
  "graph:read",
  "graph:write",
  "connector:manage",
];

export function KeyForm({ onSubmit, onCancel }: KeyFormProps) {
  const [label, setLabel] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["document:read"]);
  const [expiryDays, setExpiryDays] = useState("90");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const togglePermission = (perm: string) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!label.trim()) {
      setError("Key name is required.");
      return;
    }
    if (permissions.length === 0) {
      setError("At least one permission is required.");
      return;
    }

    setSubmitting(true);
    try {
      const expiresIn = expiryDays && expiryDays !== "0"
        ? new Date(Date.now() + parseInt(expiryDays) * 86400000).toISOString()
        : undefined;

      await onSubmit({
        label: label.trim(),
        permissions,
        expires_at: expiresIn,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="Key Name"
        placeholder="e.g. Production API Key"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        error={error && !error.includes("permission") ? error : undefined}
        autoFocus
      />

      <div>
        <label className="block text-sm font-medium text-surface-700 mb-2">
          Permissions
        </label>
        <div className="grid grid-cols-2 gap-2">
          {availablePermissions.map((perm) => {
            const selected = permissions.includes(perm);
            return (
              <button
                key={perm}
                type="button"
                onClick={() => togglePermission(perm)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all
                  ${selected
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-surface-200 bg-white text-surface-600 hover:border-surface-300"
                  }
                `.trim()}
              >
                <span className={`h-3.5 w-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? "border-brand-600 bg-brand-600" : "border-surface-300"}`}>
                  {selected && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {perm}
              </button>
            );
          })}
        </div>
        {error && error.includes("permission") && (
          <p className="mt-1 text-xs text-error-600">{error}</p>
        )}
      </div>

      <Input
        label="Expiry (days)"
        type="number"
        placeholder="90"
        value={expiryDays}
        onChange={(e) => setExpiryDays(e.target.value)}
        hint="Leave 0 for no expiration."
      />

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Create Key
        </Button>
      </div>
    </form>
  );
}

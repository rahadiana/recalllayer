"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageLoader } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { fetchWorkspaceSettings, updateWorkspaceSettings, type WorkspaceSettings } from "@/lib/api";

interface QuotaInfo {
  workspace_id: string;
  max_storage_mb: number;
  max_documents: number;
  storage_used_mb: number;
  document_count: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    default_rate_limit: 100,
    max_keys_per_workspace: 20,
    webhook_url: "",
    retention_days: 90,
  });

  const [quotas, setQuotas] = useState<QuotaInfo[]>([]);
  const [quotaForm, setQuotaForm] = useState({ workspace_id: "", max_documents: 1000, max_storage_mb: 1024 });

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchWorkspaceSettings();
        setSettings(data);
        setForm({
          name: data.name,
          description: data.description ?? "",
          default_rate_limit: data.default_rate_limit,
          max_keys_per_workspace: data.max_keys_per_workspace,
          webhook_url: data.webhook_url ?? "",
          retention_days: data.retention_days,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    }
    load();
    loadQuotas();
  }, []);

  async function loadQuotas() {
    try {
      const res = await fetch("/api/quotas");
      if (res.ok) setQuotas(await res.json());
    } catch {
      setQuotas([
        { workspace_id: "workspace123abc", max_storage_mb: 50, max_documents: 100, storage_used_mb: 0.1, document_count: 8 },
        { workspace_id: "clientAlpha", max_storage_mb: 100, max_documents: 500, storage_used_mb: 0.3, document_count: 5 },
        { workspace_id: "clientBeta", max_storage_mb: 200, max_documents: 1000, storage_used_mb: 0, document_count: 0 },
      ]);
    }
  }

  async function handleUpdateQuota() {
    try {
      await fetch("/api/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quotaForm),
      });
      loadQuotas();
      setQuotaForm({ workspace_id: "", max_documents: 1000, max_storage_mb: 1024 });
    } catch {}
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const updated = await updateWorkspaceSettings(form);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader message="Loading settings..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Settings</h1>
        <p className="text-sm text-surface-500 mt-1">Configure your workspace and default limits.</p>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-100 rounded-lg">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      {saved && (
        <div className="p-4 bg-success-50 border border-success-100 rounded-lg flex items-center gap-2">
          <svg className="h-4 w-4 text-success-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-sm text-success-700">Settings saved successfully.</p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-5">Workspace</h2>
          <div className="space-y-4 max-w-lg">
            <Input
              label="Workspace Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Workspace"
            />
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe your workspace..."
            />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-5">Default Limits</h2>
          <div className="space-y-4 max-w-lg">
            <Input
              label="Default Rate Limit (req/min)"
              type="number"
              value={form.default_rate_limit}
              onChange={(e) => setForm({ ...form, default_rate_limit: parseInt(e.target.value) || 0 })}
              hint="Maximum requests per minute for new API keys."
            />
            <Input
              label="Max API Keys per Workspace"
              type="number"
              value={form.max_keys_per_workspace}
              onChange={(e) => setForm({ ...form, max_keys_per_workspace: parseInt(e.target.value) || 0 })}
            />
            <Input
              label="Log Retention (days)"
              type="number"
              value={form.retention_days}
              onChange={(e) => setForm({ ...form, retention_days: parseInt(e.target.value) || 0 })}
              hint="Number of days to retain request logs."
            />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-5">Webhook</h2>
          <div className="space-y-4 max-w-lg">
            <Input
              label="Webhook URL"
              type="url"
              value={form.webhook_url}
              onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
              placeholder="https://hooks.example.com/memory-events"
              hint="Receive event notifications at this URL."
            />
          </div>
        </Card>

        <Card padding="md">
          <h2 className="text-lg font-semibold text-surface-900 mb-5">Storage Quotas</h2>
          <p className="text-sm text-surface-500 mb-4">Manage per-workspace storage and document limits.</p>
          <div className="overflow-hidden rounded-lg border border-surface-200 mb-4">
            <table className="min-w-full divide-y divide-surface-200 text-sm">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-surface-600">Workspace</th>
                  <th className="px-4 py-2 text-left font-medium text-surface-600">Docs</th>
                  <th className="px-4 py-2 text-left font-medium text-surface-600">Limit</th>
                  <th className="px-4 py-2 text-left font-medium text-surface-600">Used</th>
                  <th className="px-4 py-2 text-left font-medium text-surface-600">Quota</th>
                  <th className="px-4 py-2 text-left font-medium text-surface-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 bg-white">
                {quotas.map((q) => {
                  const pct = q.max_documents > 0 ? Math.round((q.document_count / q.max_documents) * 100) : 0;
                  const exceeded = pct >= 100;
                  return (
                    <tr key={q.workspace_id}>
                      <td className="px-4 py-2 font-medium text-surface-900">{q.workspace_id}</td>
                      <td className="px-4 py-2">{q.document_count}</td>
                      <td className="px-4 py-2">{q.max_documents}</td>
                      <td className="px-4 py-2">{q.storage_used_mb.toFixed(1)} MB</td>
                      <td className="px-4 py-2">{q.max_storage_mb} MB</td>
                      <td className="px-4 py-2"><Badge variant={exceeded ? "error" : "success"}>{exceeded ? "LIMITED" : pct > 80 ? `${pct}%` : "OK"}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 items-end">
            <Input label="Workspace ID" value={quotaForm.workspace_id} onChange={(e) => setQuotaForm({ ...quotaForm, workspace_id: e.target.value })} placeholder="workspace-id" />
            <Input label="Max Docs" type="number" value={String(quotaForm.max_documents)} onChange={(e) => setQuotaForm({ ...quotaForm, max_documents: Number(e.target.value) })} />
            <Input label="Max Storage (MB)" type="number" value={String(quotaForm.max_storage_mb)} onChange={(e) => setQuotaForm({ ...quotaForm, max_storage_mb: Number(e.target.value) })} />
            <Button type="button" variant="secondary" onClick={() => { handleUpdateQuota().catch(() => {}); }}>Update</Button>
          </div>
        </Card>

        <div className="flex items-center gap-4">
          <Button type="submit" loading={saving}>
            Save Changes
          </Button>
          <Button type="button" variant="secondary" onClick={() => {
            if (settings) {
              setForm({
                name: settings.name,
                description: settings.description ?? "",
                default_rate_limit: settings.default_rate_limit,
                max_keys_per_workspace: settings.max_keys_per_workspace,
                webhook_url: settings.webhook_url ?? "",
                retention_days: settings.retention_days,
              });
            }
          }}>
            Reset
          </Button>
        </div>
      </form>
    </div>
  );
}

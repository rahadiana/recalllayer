"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { KeyTable } from "@/components/api-keys/KeyTable";
import { KeyForm } from "@/components/api-keys/KeyForm";
import { KeyActions } from "@/components/api-keys/KeyActions";
import { fetchApiKeys, createApiKey, revokeApiKey } from "@/lib/api";
import type { ApiKey, ApiKeyCreated } from "@memory-platform/shared-schemas";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyData, setNewKeyData] = useState<ApiKeyCreated | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoading(true);
    try {
      const data = await fetchApiKeys();
      setKeys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(data: { label: string; permissions: string[]; expires_at?: string }) {
    const result = await createApiKey(data);
    setShowCreateModal(false);
    setNewKeyData(result);
    await loadKeys();
  }

  async function handleRevoke(key: ApiKey) {
    setRevokingId(key.id);
    try {
      await revokeApiKey(key.id);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key.");
    } finally {
      setRevokingId(null);
    }
  }

  const activeCount = keys.filter((k) => k.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">API Keys</h1>
          <p className="text-sm text-surface-500 mt-1">
            {activeCount} active · {keys.length} total
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Key
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-error-50 border border-error-100 rounded-lg">
          <p className="text-sm text-error-700">{error}</p>
        </div>
      )}

      <Card padding="none">
        <KeyTable keys={keys} loading={loading} onRevoke={handleRevoke} onCopy={(key) => {
          navigator.clipboard.writeText(key.prefix).catch(() => {});
        }} />
      </Card>

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create API Key">
        <KeyForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      <Modal
        open={newKeyData !== null}
        onClose={() => setNewKeyData(null)}
        title="API Key Created"
      >
        {newKeyData && (
          <KeyActions rawKey={newKeyData.raw_key} onClose={() => setNewKeyData(null)} />
        )}
      </Modal>
    </div>
  );
}

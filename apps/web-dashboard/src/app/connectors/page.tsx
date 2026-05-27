"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConnectorStatusBadge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { fetchConnectors, triggerSync } from "@/lib/api";
import type { ConnectorAccount } from "@memory-platform/shared-schemas";

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadConnectors();
  }, []);

  const loadConnectors = async () => {
    setLoading(true);
    const result = await fetchConnectors();
    setConnectors(result);
    setLoading(false);
  };

  const handleSync = async (connector: ConnectorAccount, mode: "full" | "incremental" = "incremental") => {
    setSyncing((prev) => ({ ...prev, [connector.id]: true }));
    try {
      await triggerSync(connector.id, mode);
      await loadConnectors();
    } finally {
      setSyncing((prev) => ({ ...prev, [connector.id]: false }));
    }
  };

  if (loading) return <PageLoader message="Loading connectors..." />;

  const activeConnectors = connectors.filter((c) => c.is_active);
  const inactiveConnectors = connectors.filter((c) => !c.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Connectors</h1>
        <p className="text-sm text-surface-500 mt-1">
          Manage connections to external data sources.
        </p>
      </div>

      {activeConnectors.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-3">
            Active ({activeConnectors.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeConnectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                syncing={!!syncing[connector.id]}
                onSync={(mode) => handleSync(connector, mode)}
              />
            ))}
          </div>
        </div>
      )}

      {inactiveConnectors.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-3">
            Inactive ({inactiveConnectors.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
            {inactiveConnectors.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                syncing={false}
                onSync={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {connectors.length === 0 && (
        <Card padding="md" className="text-center py-16">
          <svg className="mx-auto h-12 w-12 text-surface-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <h3 className="text-lg font-medium text-surface-700 mb-1">No connectors configured</h3>
          <p className="text-sm text-surface-400 max-w-md mx-auto">
            Connect external data sources like Google Drive, Notion, or Slack to automatically sync content into your memory.
          </p>
        </Card>
      )}
    </div>
  );
}

function ConnectorCard({
  connector,
  syncing,
  onSync,
}: {
  connector: ConnectorAccount;
  syncing: boolean;
  onSync: (mode: "full" | "incremental") => void;
}) {
  return (
    <Card padding="md" className="space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ConnectorIcon type={connector.connector_type} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-900">{connector.label}</h3>
            <p className="text-xs text-surface-500 capitalize">{connector.connector_type.replace("-", " ")}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-surface-500">
          {connector.sync_state.sync_count} syncs
        </span>
        {connector.last_synced_at && (
          <span className="text-xs text-surface-400">
            · Last: {new Date(connector.last_synced_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {connector.config.watched_paths && connector.config.watched_paths.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-surface-500">Watching</p>
          <div className="flex flex-wrap gap-1">
            {connector.config.watched_paths.map((p) => (
              <span key={p} className="px-2 py-0.5 rounded-md bg-surface-100 text-xs text-surface-600 font-mono">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-surface-100">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={syncing}
            onClick={() => onSync("incremental")}
            disabled={!connector.is_active}
          >
            Sync Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={syncing}
            onClick={() => onSync("full")}
            disabled={!connector.is_active}
          >
            Full Sync
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ConnectorIcon({ type }: { type: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    "google-drive": (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.433 22.396l.24.354h14.826l-.24-.354L12.175 7.05 4.433 22.396zM16.37 6.503L12.167 2H7.65l4.203 4.503h4.517zM16.37 6.503h4.217L16.384 2h-4.217l4.203 4.503zM7.65 22.75l4.517-4.503V2l-4.517 4.503v16.247z" />
      </svg>
    ),
    notion: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.326.466l1.775 1.447zM2.83 7.115v13.082c0 .373.14.513.467.467l13.73-2.01c.374-.047.42-.28.42-.514V5.396c0-.374-.093-.513-.467-.467L3.298 6.648c-.327.046-.467.186-.467.467zm14.71-1.68l.093 12.85c0 .326-.14.42-.373.467l-11.62 2.01c-.28.047-.373-.094-.327-.42l.886-12.66c.046-.326.186-.467.42-.513l11.153-1.634c.28-.047.42.14.374.42zM7.072 20.938l10.63-1.82V5.442l-10.63 1.82v13.676z" />
      </svg>
    ),
    slack: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.528 2.528 0 01-2.521-2.522v-2.522h2.521zM15.165 17.688a2.528 2.528 0 01-2.521-2.523 2.528 2.528 0 012.521-2.521h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" />
      </svg>
    ),
    github: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  };

  return (
    <>{iconMap[type] ?? (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    )}</>
  );
}

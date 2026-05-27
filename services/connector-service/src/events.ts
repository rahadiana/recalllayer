import { EventEmitter } from "node:events";
import {
  Publisher,
  type EventEnvelope,
} from "@memory-platform/queue";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { WorkspaceId } from "@memory-platform/shared-schemas";

// ─── Event Payloads ────────────────────────────────────────────────────────

export interface ConnectorSyncRequestedPayload {
  connector_type: string;
  account_id: string;
  sync_mode: "full" | "incremental";
}

export interface ExternalDocumentDiscoveredPayload {
  connector_type: string;
  account_id: string;
  external_id: string;
  name: string;
  mime_type?: string;
  size_bytes?: number;
  checksum?: string;
  external_updated_at?: string;
}

export interface ExternalDocumentUpdatedPayload {
  connector_type: string;
  account_id: string;
  external_id: string;
  document_id?: string;
  name: string;
  mime_type?: string;
  size_bytes?: number;
  checksum?: string;
  external_updated_at?: string;
}

export interface ExternalDocumentDeletedPayload {
  connector_type: string;
  account_id: string;
  external_id: string;
  document_id?: string;
}

// ─── Event Publisher ───────────────────────────────────────────────────────

export interface EventPublisher {
  publishSyncRequested(
    workspaceId: WorkspaceId,
    payload: ConnectorSyncRequestedPayload,
  ): Promise<string>;
  publishDocumentDiscovered(
    workspaceId: WorkspaceId,
    payload: ExternalDocumentDiscoveredPayload,
  ): Promise<string>;
  publishDocumentUpdated(
    workspaceId: WorkspaceId,
    payload: ExternalDocumentUpdatedPayload,
  ): Promise<string>;
  publishDocumentDeleted(
    workspaceId: WorkspaceId,
    payload: ExternalDocumentDeletedPayload,
  ): Promise<string>;
  publishSyncStarted(
    workspaceId: WorkspaceId,
    connectorType: string,
    accountId: string,
  ): Promise<string>;
  publishSyncCompleted(
    workspaceId: WorkspaceId,
    connectorType: string,
    accountId: string,
    documentsSynced: number,
  ): Promise<string>;
  publishSyncFailed(
    workspaceId: WorkspaceId,
    connectorType: string,
    accountId: string,
    error: string,
  ): Promise<string>;
  readonly events: EventEmitter;
  close(): Promise<void>;
}

export type EventPublisherFactory = (
  publisher: Publisher,
) => EventPublisher;

const CHANNEL = "connector-events";

export function createEventPublisher(publisher: Publisher): EventPublisher {
  const log = createLogger("connector-events");
  const emitter = new EventEmitter();

  const emit = async (
    eventType: string,
    workspaceId: WorkspaceId,
    payload: Record<string, unknown>,
  ): Promise<string> => {
    const eventId = generateId("evt");

    const envelope: EventEnvelope = {
      id: eventId,
      type: eventType,
      timestamp: new Date().toISOString(),
      payload,
      metadata: {
        workspace_id: workspaceId,
      },
      correlationId: generateId("corr"),
    };

    await publisher.publish(CHANNEL, envelope);
    emitter.emit("published", { eventType, eventId, workspaceId });

    log.debug("Event published", { eventType, eventId, channel: CHANNEL });
    return eventId;
  };

  return {
    async publishSyncRequested(workspaceId, payload) {
      return emit("connector.sync.requested", workspaceId, payload as unknown as Record<string, unknown>);
    },
    async publishDocumentDiscovered(workspaceId, payload) {
      return emit("external.document.discovered", workspaceId, payload as unknown as Record<string, unknown>);
    },
    async publishDocumentUpdated(workspaceId, payload) {
      return emit("external.document.updated", workspaceId, payload as unknown as Record<string, unknown>);
    },
    async publishDocumentDeleted(workspaceId, payload) {
      return emit("external.document.deleted", workspaceId, payload as unknown as Record<string, unknown>);
    },
    async publishSyncStarted(workspaceId, connectorType, accountId) {
      return emit("connector.sync_started", workspaceId, {
        connector_id: connectorType,
        account_id: accountId,
      });
    },
    async publishSyncCompleted(
      workspaceId,
      connectorType,
      accountId,
      documentsSynced,
    ) {
      return emit("connector.sync_completed", workspaceId, {
        connector_id: connectorType,
        account_id: accountId,
        documents_synced: documentsSynced,
      });
    },
    async publishSyncFailed(
      workspaceId,
      connectorType,
      accountId,
      error,
    ) {
      return emit("connector.sync_failed", workspaceId, {
        connector_id: connectorType,
        account_id: accountId,
        error,
      });
    },
    get events() {
      return emitter;
    },
    async close() {
      log.info("Event publisher closing");
      emitter.removeAllListeners();
    },
  };
}

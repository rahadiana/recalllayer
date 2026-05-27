import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import {
  Publisher,
  type QueueConfig,
  type EventEnvelope,
} from "@memory-platform/queue";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type { WorkspaceId, UserId } from "@memory-platform/shared-schemas";

export interface ProfileUpdatedPayload {
  profile_id: string;
  workspace_id: string;
  user_id: string;
  changed_keys: string[];
  preference_count: number;
  fact_count: number;
}

export interface PreferenceDetectedPayload {
  profile_id: string;
  workspace_id: string;
  user_id: string;
  preference_key: string;
  preference_value: unknown;
  confidence: number;
  source: "inferred";
}

export type ProfileEventPayload =
  | ProfileUpdatedPayload
  | PreferenceDetectedPayload;

export class EventPublisher {
  #publisher: Publisher;
  #log: Logger;
  #channel: string;

  constructor(redis: Redis, config: QueueConfig) {
    const events = new EventEmitter();
    this.#publisher = new Publisher(redis, config, events, "profile-memory-service");
    this.#log = createLogger("profile-memory:events");
    this.#channel = config.defaultChannel ?? "profile";

    events.on("queue:published", (envelope, channel) => {
      this.#log.debug("Event published", {
        eventType: (envelope as EventEnvelope).type,
        channel: channel as string,
      });
    });

    events.on("queue:error", (_msg, error) => {
      this.#log.error("Event publish error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async publishProfileUpdated(
    workspaceId: WorkspaceId,
    payload: ProfileUpdatedPayload,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<ProfileUpdatedPayload> = {
      id: generateId(),
      type: "profile.updated",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing profile.updated", {
      profileId: payload.profile_id,
      workspaceId: workspaceId as string,
      changedKeys: payload.changed_keys,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }

  async publishPreferenceDetected(
    workspaceId: WorkspaceId,
    payload: PreferenceDetectedPayload,
    correlationId?: string,
  ): Promise<string> {
    const envelope: EventEnvelope<PreferenceDetectedPayload> = {
      id: generateId(),
      type: "preference.detected",
      timestamp: new Date().toISOString(),
      payload,
      correlationId,
    };

    this.#log.info("Publishing preference.detected", {
      profileId: payload.profile_id,
      key: payload.preference_key,
      confidence: payload.confidence,
    });

    return this.#publisher.publish(this.#channel, envelope);
  }
}

import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import {
  Subscriber,
  type SubscriberHandler,
  type QueueConfig,
  type Message,
} from "@memory-platform/queue";
import { createLogger, type Logger } from "@memory-platform/observability";
import type { WorkspaceId, UserId } from "@memory-platform/shared-schemas";
import { ProfileRepository } from "./profile-repository.js";
import { PreferenceTracker } from "./preference-tracker.js";
import { BehaviorAnalyzer } from "./behavior-analyzer.js";
import { SignalProcessor } from "./signal-processor.js";
import type { EventPublisher } from "./events.js";
import type { ProfileMemoryServiceConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

interface SearchPerformedPayload {
  workspace_id: string;
  user_id: string;
  query: string;
  result_count?: number;
  latency_ms?: number;
  filters?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DocumentIndexedPayload {
  workspace_id: string;
  user_id?: string;
  document_id: string;
  title: string;
  category?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface ProfileSignalPayload {
  workspace_id: string;
  user_id: string;
  signal_type: string;
  payload: Record<string, unknown>;
  session_id?: string;
  [key: string]: unknown;
}

export interface WorkerDeps {
  redis: Redis;
  queueConfig: QueueConfig;
  repo: ProfileRepository;
  events: EventPublisher;
  config: ProfileMemoryServiceConfig;
}

export class ProfileMemoryWorker {
  #subscriber: Subscriber;
  #repo: ProfileRepository;
  #events: EventPublisher;
  #preferenceTracker: PreferenceTracker;
  #behaviorAnalyzer: BehaviorAnalyzer;
  #signalProcessor: SignalProcessor;
  #log: Logger;
  #config: ProfileMemoryServiceConfig;
  #unsubscribers: Array<() => void>;

  constructor(deps: WorkerDeps) {
    const eventsEmitter = new EventEmitter();
    this.#subscriber = new Subscriber(
      deps.redis,
      deps.queueConfig,
      eventsEmitter,
      "profile-memory-worker",
    );
    this.#repo = deps.repo;
    this.#events = deps.events;
    this.#config = deps.config;
    this.#preferenceTracker = new PreferenceTracker(
      deps.config.inferenceConfidenceThreshold ??
        DEFAULT_CONFIG.inferenceConfidenceThreshold,
    );
    this.#behaviorAnalyzer = new BehaviorAnalyzer();
    this.#signalProcessor = new SignalProcessor();
    this.#log = createLogger("profile-memory:worker");
    this.#unsubscribers = [];

    eventsEmitter.on("queue:received", (msg: unknown) => {
      const message = msg as Message;
      this.#log.debug("Event received", {
        eventType: message.event.type,
        eventId: message.event.id,
      });
    });

    eventsEmitter.on("queue:processed", (msg: unknown) => {
      const message = msg as Message;
      this.#log.debug("Event processed", {
        eventType: message.event.type,
        eventId: message.event.id,
      });
    });

    eventsEmitter.on("queue:error", (msg: unknown, error: Error) => {
      const message = msg as Message;
      this.#log.error("Event processing error", {
        eventType: message.event.type,
        eventId: message.event.id,
        error: error.message,
      });
    });
  }

  start(): void {
    const searchHandler: SubscriberHandler<SearchPerformedPayload> = async (msg) => {
      await this.#handleSearchPerformed(msg);
    };

    const docIndexedHandler: SubscriberHandler<DocumentIndexedPayload> = async (msg) => {
      await this.#handleDocumentIndexed(msg);
    };

    const signalHandler: SubscriberHandler<ProfileSignalPayload> = async (msg) => {
      await this.#handleProfileSignal(msg);
    };

    this.#unsubscribers.push(
      this.#subscriber.subscribe("search.performed", searchHandler, {
        concurrency: 5,
      }),
    );

    this.#unsubscribers.push(
      this.#subscriber.subscribe("document.indexed", docIndexedHandler, {
        concurrency: 5,
      }),
    );

    this.#unsubscribers.push(
      this.#subscriber.subscribe("profile.signal.detected", signalHandler, {
        concurrency: 5,
      }),
    );

    this.#log.info("Profile memory worker started", {
      channels: ["search.performed", "document.indexed", "profile.signal.detected"],
    });
  }

  stop(): void {
    for (const unsubscribe of this.#unsubscribers) {
      unsubscribe();
    }
    this.#unsubscribers = [];
    this.#log.info("Profile memory worker stopped");
  }

  async #handleSearchPerformed(msg: Message<SearchPerformedPayload>): Promise<void> {
    const { payload, correlationId } = msg.event;
    const workspaceId = payload.workspace_id as WorkspaceId;
    const userId = payload.user_id as UserId;

    if (!workspaceId || !userId) {
      this.#log.warn("Search event missing workspace_id or user_id", {
        eventId: msg.event.id,
      });
      return;
    }

    this.#log.info("Processing search.performed", {
      workspaceId,
      userId,
      query: payload.query?.substring(0, 50),
    });

    const profile = await this.#repo.getOrCreateProfile(workspaceId, userId);
    const profileId = profile.id;

    await this.#repo.recordBehaviorEvent(workspaceId, userId, {
      event_type: "search",
      payload: {
        query: payload.query,
        result_count: payload.result_count,
        latency_ms: payload.latency_ms,
        filters: payload.filters,
      },
    });

    const recentEvents = await this.#repo.getBehaviorEvents(workspaceId, userId, 50);
    const analysis = this.#behaviorAnalyzer.analyzeRecentEvents(recentEvents);
    await this.#repo.updateBehaviourSummary(profileId, analysis.summaryUpdates);

    const searchQueries = recentEvents
      .filter((e) => e.event_type === "search")
      .map((e) => e.payload?.query as string | undefined)
      .filter((q): q is string => typeof q === "string");

    if (searchQueries.length >= 3) {
      const preferenceAnalysis = this.#preferenceTracker.analyzeSearchQueries(searchQueries);

      for (const pref of preferenceAnalysis.detectedPreferences) {
        await this.#repo.upsertPreference(profileId, pref);

        if (
          pref.source === "inferred" &&
          (pref.confidence ?? 0) >= (this.#config.inferenceConfidenceThreshold ?? 0.7)
        ) {
          await this.#events.publishPreferenceDetected(workspaceId, {
            profile_id: profileId,
            workspace_id: workspaceId as string,
            user_id: userId,
            preference_key: pref.key,
            preference_value: pref.value,
            confidence: pref.confidence ?? 0,
            source: "inferred",
          }, correlationId);
        }
      }
    }

    await this.#events.publishProfileUpdated(workspaceId, {
      profile_id: profileId,
      workspace_id: workspaceId as string,
      user_id: userId,
      changed_keys: analysis.patterns.map((p) => p.category),
      preference_count: (await this.#repo.getPreferences(profileId)).length,
      fact_count: (await this.#repo.getProfileFacts(profileId)).length,
    }, correlationId);

    this.#log.info("Search event handled", {
      profileId,
      patternsDetected: analysis.patterns.length,
    });
  }

  async #handleDocumentIndexed(msg: Message<DocumentIndexedPayload>): Promise<void> {
    const { payload, correlationId } = msg.event;
    const workspaceId = payload.workspace_id as WorkspaceId;
    const userId = payload.user_id as UserId | undefined;

    if (!workspaceId) {
      this.#log.warn("Document indexed event missing workspace_id", {
        eventId: msg.event.id,
      });
      return;
    }

    if (!userId) {
      this.#log.debug("Document indexed without user_id, skipping profile update", {
        documentId: payload.document_id,
      });
      return;
    }

    this.#log.info("Processing document.indexed", {
      workspaceId,
      userId,
      documentId: payload.document_id,
    });

    const profile = await this.#repo.getOrCreateProfile(workspaceId, userId);
    const profileId = profile.id;

    await this.#repo.recordBehaviorEvent(workspaceId, userId, {
      event_type: "document_view",
      payload: {
        document_id: payload.document_id,
        document_title: payload.title,
        category: payload.category,
        tags: payload.tags,
      },
    });

    const recentEvents = await this.#repo.getBehaviorEvents(workspaceId, userId, 50);
    const analysis = this.#behaviorAnalyzer.analyzeRecentEvents(recentEvents);
    await this.#repo.updateBehaviourSummary(profileId, analysis.summaryUpdates);

    if (payload.category) {
      await this.#repo.upsertProfileFact(profileId, {
        key: "document_category_interest",
        value: payload.category,
        evidence: [payload.document_id],
        confidence: 0.5,
      });
    }

    await this.#events.publishProfileUpdated(workspaceId, {
      profile_id: profileId,
      workspace_id: workspaceId as string,
      user_id: userId,
      changed_keys: ["document_interactions", ...analysis.patterns.map((p) => p.category)],
      preference_count: (await this.#repo.getPreferences(profileId)).length,
      fact_count: (await this.#repo.getProfileFacts(profileId)).length,
    }, correlationId);

    this.#log.info("Document indexed event handled", {
      profileId,
      patternsDetected: analysis.patterns.length,
    });
  }

  async #handleProfileSignal(msg: Message<ProfileSignalPayload>): Promise<void> {
    const { payload, correlationId } = msg.event;
    const workspaceId = payload.workspace_id as WorkspaceId;
    const userId = payload.user_id as UserId;

    if (!workspaceId || !userId) {
      this.#log.warn("Profile signal event missing workspace_id or user_id", {
        eventId: msg.event.id,
      });
      return;
    }

    this.#log.info("Processing profile.signal.detected", {
      workspaceId,
      userId,
      signalType: payload.signal_type,
    });

    const profile = await this.#repo.getOrCreateProfile(workspaceId, userId);
    const profileId = profile.id;

    await this.#repo.recordBehaviorEvent(workspaceId, userId, {
      event_type: payload.signal_type ?? "profile_signal",
      payload: payload.payload ?? {},
      session_id: payload.session_id,
    });

    if (payload.signal_type === "setting_change") {
      const settings = payload.payload?.settings as Record<string, unknown> | undefined;
      if (settings) {
        const explicitPrefs = this.#preferenceTracker.analyzeExplicitSettings(settings);
        for (const pref of explicitPrefs) {
          await this.#repo.upsertPreference(profileId, pref);
        }
      }
    }

    if (payload.signal_type === "feedback") {
      const rating = payload.payload?.rating as number | undefined;
      if (typeof rating === "number") {
        const feedbackEntries = [{ rating, comment: payload.payload?.comment as string | undefined }];
        const analysis = this.#preferenceTracker.analyzeFeedback(feedbackEntries);
        for (const pref of analysis.detectedPreferences) {
          await this.#repo.upsertPreference(profileId, pref);
        }
      }
    }

    const recentEvents = await this.#repo.getBehaviorEvents(workspaceId, userId, 50);
    const analysis = this.#behaviorAnalyzer.analyzeRecentEvents(recentEvents);
    await this.#repo.updateBehaviourSummary(profileId, analysis.summaryUpdates);

    await this.#events.publishProfileUpdated(workspaceId, {
      profile_id: profileId,
      workspace_id: workspaceId as string,
      user_id: userId,
      changed_keys: [payload.signal_type, ...analysis.patterns.map((p) => p.category)],
      preference_count: (await this.#repo.getPreferences(profileId)).length,
      fact_count: (await this.#repo.getProfileFacts(profileId)).length,
    }, correlationId);

    this.#log.info("Profile signal event handled", {
      profileId,
      signalType: payload.signal_type,
      patternsDetected: analysis.patterns.length,
    });
  }
}

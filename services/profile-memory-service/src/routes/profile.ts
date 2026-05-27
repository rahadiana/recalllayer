import { Router } from "express";
import type { Request, Response } from "express";
import type { WorkspaceId, UserId } from "@memory-platform/shared-schemas";
import { createLogger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import { ProfileRepository } from "../profile-repository.js";
import { PreferenceTracker } from "../preference-tracker.js";
import { BehaviorAnalyzer } from "../behavior-analyzer.js";
import { SignalProcessor } from "../signal-processor.js";
import type { EventPublisher } from "../events.js";
import type {
  ProfileSignal,
  PostSignalsRequest,
  ProfileMemoryServiceConfig,
} from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

export function createProfileRoutes(
  repo: ProfileRepository,
  events: EventPublisher,
  config: ProfileMemoryServiceConfig,
): Router {
  const router = Router();
  const log = createLogger("profile-memory:routes");
  const preferenceTracker = new PreferenceTracker(
    config.inferenceConfidenceThreshold ??
      DEFAULT_CONFIG.inferenceConfidenceThreshold,
  );
  const behaviorAnalyzer = new BehaviorAnalyzer();
  const signalProcessor = new SignalProcessor();

  router.get(
    "/internal/profiles/:workspaceId",
    async (req: Request, res: Response) => {
      const start = Date.now();
      const workspaceId = req.params.workspaceId as WorkspaceId;
      const userId = req.query.user_id as string | undefined;

      if (!workspaceId) {
        log.warn("GET /internal/profiles/:workspaceId missing workspaceId");
        res.status(400).json({
          code: "MISSING_REQUIRED_FIELD",
          message: "workspaceId path parameter is required",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: req.path,
        });
        return;
      }

      if (!userId) {
        log.warn("GET /internal/profiles/:workspaceId missing user_id query param");
        res.status(400).json({
          code: "MISSING_REQUIRED_FIELD",
          message: "user_id query parameter is required",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: req.path,
        });
        return;
      }

      log.info("GET /internal/profiles/:workspaceId requested", {
        workspaceId: workspaceId as string,
        userId,
      });

      const context = await repo.buildProfileContext(workspaceId, userId as UserId);

      if (!context) {
        res.status(404).json({
          code: "PROFILE_NOT_FOUND",
          message: `Profile not found for workspace ${workspaceId as string} and user ${userId}`,
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: req.path,
        });
        return;
      }

      log.info("GET /internal/profiles/:workspaceId completed", {
        workspaceId: workspaceId as string,
        userId,
        latencyMs: Date.now() - start,
      });

      res.json({ profile: context });
    },
  );

  router.post(
    "/internal/profiles/signals",
    async (req: Request, res: Response) => {
      const start = Date.now();
      const body = req.body as PostSignalsRequest;

      if (!body.signals || !Array.isArray(body.signals) || body.signals.length === 0) {
        log.warn("POST /internal/profiles/signals invalid body");
        res.status(400).json({
          code: "INVALID_INPUT",
          message: "Request body must contain a non-empty signals array",
          error_id: generateId(),
          timestamp: new Date().toISOString(),
          path: req.path,
        });
        return;
      }

      log.info("POST /internal/profiles/signals requested", {
        signalCount: body.signals.length,
      });

      const eventIds: string[] = [];
      let acceptedCount = 0;

      for (const signal of body.signals) {
        try {
          await processSignal(
            signal,
            repo,
            events,
            preferenceTracker,
            behaviorAnalyzer,
            signalProcessor,
            config,
            eventIds,
          );
          acceptedCount++;
        } catch (err) {
          log.error("Signal processing failed", {
            workspaceId: signal.workspace_id as string,
            signalType: signal.signal_type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      log.info("POST /internal/profiles/signals completed", {
        accepted: acceptedCount,
        total: body.signals.length,
        latencyMs: Date.now() - start,
      });

      res.status(200).json({
        accepted: acceptedCount,
        event_ids: eventIds,
      });
    },
  );

  return router;
}

async function processSignal(
  signal: ProfileSignal,
  repo: ProfileRepository,
  events: EventPublisher,
  preferenceTracker: PreferenceTracker,
  behaviorAnalyzer: BehaviorAnalyzer,
  _signalProcessor: SignalProcessor,
  config: ProfileMemoryServiceConfig,
  eventIds: string[],
): Promise<void> {
  const profile = await repo.getOrCreateProfile(signal.workspace_id, signal.user_id);
  const profileId = profile.id;

  await repo.recordBehaviorEvent(signal.workspace_id, signal.user_id, {
    event_type: signal.signal_type,
    payload: signal.payload,
    session_id: signal.session_id,
  });

  if (signal.signal_type === "search") {
    const queries = [signal.payload.query as string].filter(Boolean);
    if (queries.length > 0) {
      const analysis = preferenceTracker.analyzeSearchQueries(queries);
      for (const pref of analysis.detectedPreferences) {
        await repo.upsertPreference(profileId, pref);
        if (
          pref.source === "inferred" &&
          (pref.confidence ?? 0) >= (config.inferenceConfidenceThreshold ?? 0.7)
        ) {
          const eventId = await events.publishPreferenceDetected(signal.workspace_id, {
            profile_id: profileId,
            workspace_id: signal.workspace_id as string,
            user_id: signal.user_id,
            preference_key: pref.key,
            preference_value: pref.value,
            confidence: pref.confidence ?? 0,
            source: "inferred",
          }, signal.correlation_id);
          eventIds.push(eventId);
        }
      }
    }
  }

  if (signal.signal_type === "feedback") {
    const rating = signal.payload.rating as number | undefined;
    const comment = signal.payload.comment as string | undefined;
    if (typeof rating === "number") {
      const analysis = preferenceTracker.analyzeFeedback([{ rating, comment }]);
      for (const pref of analysis.detectedPreferences) {
        await repo.upsertPreference(profileId, pref);
      }
    }
  }

  if (signal.signal_type === "setting_change") {
    const settings = signal.payload.settings as Record<string, unknown> | undefined;
    if (settings) {
      const explicitPrefs = preferenceTracker.analyzeExplicitSettings(settings);
      for (const pref of explicitPrefs) {
        await repo.upsertPreference(profileId, pref);
      }
    }
  }

  if (signal.signal_type === "document_view") {
    const category = signal.payload.category as string | undefined;
    if (category) {
      await repo.upsertProfileFact(profileId, {
        key: "document_category_interest",
        value: category,
        evidence: [(signal.payload.document_id as string) ?? "unknown"],
        confidence: 0.5,
      });
    }
  }

  const recentEvents = await repo.getBehaviorEvents(signal.workspace_id, signal.user_id, 50);
  const analysis = behaviorAnalyzer.analyzeRecentEvents(recentEvents);
  await repo.updateBehaviourSummary(profileId, analysis.summaryUpdates);

  const updateEventId = await events.publishProfileUpdated(signal.workspace_id, {
    profile_id: profileId,
    workspace_id: signal.workspace_id as string,
    user_id: signal.user_id,
    changed_keys: [signal.signal_type, ...analysis.patterns.map((p) => p.category)],
    preference_count: (await repo.getPreferences(profileId)).length,
    fact_count: (await repo.getProfileFacts(profileId)).length,
  }, signal.correlation_id);
  eventIds.push(updateEventId);
}

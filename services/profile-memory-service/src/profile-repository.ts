import type { PostgresPool } from "@memory-platform/db";
import type {
  WorkspaceId,
  UserId,
  UserProfile,
  Preference,
  ProfileFact,
  BehaviorEvent,
  RecordBehaviorEventDto,
  UpsertPreferenceDto,
} from "@memory-platform/shared-schemas";
import { createLogger, type Logger } from "@memory-platform/observability";
import { generateId } from "@memory-platform/shared-utils";
import type {
  ProfileRecord,
  PreferenceRecord,
  ProfileFactRecord,
  ProfileContext,
  BehaviorEventRecord,
} from "./types.js";

export class ProfileRepository {
  #pool: PostgresPool;
  #log: Logger;

  constructor(pool: PostgresPool) {
    this.#pool = pool;
    this.#log = createLogger("profile-memory:repository");
  }

  async getOrCreateProfile(
    workspaceId: WorkspaceId,
    userId: UserId,
  ): Promise<ProfileRecord> {
    const profileId = `${workspaceId as string}:${userId}`;
    const existing = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      SELECT * FROM user_profiles WHERE id = ${profileId}
    `;

    if (existing[0]) {
      return this.#mapProfileRow(existing[0]);
    }

    const now = new Date().toISOString();
    const emptySummary = {
      total_searches: 0,
      total_document_views: 0,
      top_search_terms: [] as string[],
      top_categories: [] as string[],
    };

    await this.#pool.sql`
      INSERT INTO user_profiles (id, workspace_id, user_id, behaviour_summary, metadata, created_at, updated_at)
      VALUES (${profileId}, ${workspaceId}, ${userId}, ${JSON.stringify(emptySummary)}, ${JSON.stringify({})}, ${now}, ${now})
    `;

    this.#log.info("Profile created", {
      profileId,
      workspaceId: workspaceId as string,
      userId,
    });

    return {
      id: profileId,
      workspace_id: workspaceId,
      user_id: userId,
      preferences: [],
      facts: [],
      behaviour_summary: emptySummary,
      metadata: {},
      created_at: now,
      updated_at: now,
    };
  }

  async getProfile(
    workspaceId: WorkspaceId,
    userId: UserId,
  ): Promise<ProfileRecord | null> {
    const profileId = `${workspaceId as string}:${userId}`;

    const [row] = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      SELECT * FROM user_profiles WHERE id = ${profileId}
    `;

    if (!row) {
      this.#log.debug("Profile not found", { profileId });
      return null;
    }

    return this.#mapProfileRow(row);
  }

  async getPreferences(profileId: string): Promise<PreferenceRecord[]> {
    const rows = await this.#pool.sql<Record<string, unknown>[]>`
      SELECT * FROM user_preferences
      WHERE profile_id = ${profileId}
      ORDER BY updated_at DESC
    `;

    return rows.map((r) => ({
      id: r.id as string,
      profile_id: r.profile_id as string,
      key: r.key as string,
      value: r.value,
      source: r.source as "explicit" | "inferred",
      confidence: r.confidence as number,
      updated_at: r.updated_at as string,
    }));
  }

  async upsertPreference(
    profileId: string,
    dto: UpsertPreferenceDto,
  ): Promise<PreferenceRecord> {
    const id = `pref_${generateId()}`;
    const confidence = dto.confidence ?? (dto.source === "explicit" ? 1.0 : 0.5);
    const now = new Date().toISOString();

    const existing = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      SELECT id FROM user_preferences
      WHERE profile_id = ${profileId} AND key = ${dto.key}
    `;

    if (existing[0]) {
      const [row] = await this.#pool.sql<[Record<string, unknown>]>`
        UPDATE user_preferences
        SET value = ${JSON.stringify(dto.value)},
            source = ${dto.source},
            confidence = ${confidence},
            updated_at = ${now}
        WHERE id = ${existing[0].id as string}
        RETURNING *
      `;

      this.#log.debug("Preference updated", {
        profileId,
        key: dto.key,
        source: dto.source,
      });

      return {
        id: row.id as string,
        profile_id: row.profile_id as string,
        key: row.key as string,
        value: row.value as unknown,
        source: row.source as "explicit" | "inferred",
        confidence: row.confidence as number,
        updated_at: row.updated_at as string,
      };
    }

    const [row] = await this.#pool.sql<[Record<string, unknown>]>`
      INSERT INTO user_preferences (id, profile_id, key, value, source, confidence, updated_at)
      VALUES (${id}, ${profileId}, ${dto.key}, ${JSON.stringify(dto.value)}, ${dto.source}, ${confidence}, ${now})
      RETURNING *
    `;

    this.#log.info("Preference created", {
      profileId,
      key: dto.key,
      source: dto.source,
      confidence,
    });

    return {
      id: row.id as string,
      profile_id: row.profile_id as string,
      key: row.key as string,
      value: row.value as unknown,
      source: row.source as "explicit" | "inferred",
      confidence: row.confidence as number,
      updated_at: row.updated_at as string,
    };
  }

  async recordBehaviorEvent(
    workspaceId: WorkspaceId,
    userId: UserId,
    dto: RecordBehaviorEventDto,
  ): Promise<BehaviorEventRecord> {
    const id = `bev_${generateId()}`;
    const now = new Date().toISOString();
    const profileId = `${workspaceId as string}:${userId}`;

    await this.#pool.sql`
      INSERT INTO behavior_events (id, workspace_id, user_id, event_type, payload, session_id, occurred_at, profile_id)
      VALUES (${id}, ${workspaceId}, ${userId}, ${dto.event_type}, ${JSON.stringify(dto.payload)}, ${dto.session_id ?? null}, ${now}, ${profileId})
    `;

    this.#log.debug("Behavior event recorded", {
      profileId,
      eventType: dto.event_type,
    });

    return {
      id,
      workspace_id: workspaceId,
      user_id: userId,
      event_type: dto.event_type,
      payload: dto.payload,
      session_id: dto.session_id,
      occurred_at: now,
    };
  }

  async getBehaviorEvents(
    workspaceId: WorkspaceId,
    userId: UserId,
    limit: number = 100,
  ): Promise<BehaviorEventRecord[]> {
    const profileId = `${workspaceId as string}:${userId}`;

    const rows = await this.#pool.sql<Record<string, unknown>[]>`
      SELECT * FROM behavior_events
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      ORDER BY occurred_at DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => this.#mapBehaviorEventRow(r));
  }

  async upsertProfileFact(
    profileId: string,
    fact: Omit<ProfileFact, "id" | "observed_at" | "updated_at">,
  ): Promise<ProfileFactRecord> {
    const now = new Date().toISOString();

    const existing = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      SELECT id FROM profile_facts
      WHERE profile_id = ${profileId} AND key = ${fact.key}
    `;

    if (existing[0]) {
      const mergedEvidence = [
        ...new Set([...(existing[0].evidence as unknown as string[] ?? []), ...fact.evidence]),
      ];

      const [row] = await this.#pool.sql<[Record<string, unknown>]>`
        UPDATE profile_facts
        SET value = ${JSON.stringify(fact.value)},
            evidence = ${JSON.stringify(mergedEvidence)},
            confidence = ${fact.confidence},
            updated_at = ${now}
        WHERE id = ${existing[0].id as string}
        RETURNING *
      `;

      this.#log.debug("Profile fact updated", {
        profileId,
        key: fact.key,
        confidence: fact.confidence,
      });

      return {
        id: row.id as string,
        profile_id: row.profile_id as string,
        key: row.key as string,
        value: row.value as unknown,
        evidence: row.evidence as unknown as string[],
        confidence: row.confidence as number,
        observed_at: row.observed_at as string,
        updated_at: row.updated_at as string,
      };
    }

    const id = `fact_${generateId()}`;

    const [row] = await this.#pool.sql<[Record<string, unknown>]>`
      INSERT INTO profile_facts (id, profile_id, key, value, evidence, confidence, observed_at, updated_at)
      VALUES (${id}, ${profileId}, ${fact.key}, ${JSON.stringify(fact.value)}, ${JSON.stringify(fact.evidence)}, ${fact.confidence}, ${now}, ${now})
      RETURNING *
    `;

    this.#log.info("Profile fact created", {
      profileId,
      key: fact.key,
      confidence: fact.confidence,
    });

    return {
      id: row.id as string,
      profile_id: row.profile_id as string,
      key: row.key as string,
      value: row.value as unknown,
      evidence: row.evidence as unknown as string[],
      confidence: row.confidence as number,
      observed_at: row.observed_at as string,
      updated_at: row.updated_at as string,
    };
  }

  async getProfileFacts(profileId: string): Promise<ProfileFactRecord[]> {
    const rows = await this.#pool.sql<Record<string, unknown>[]>`
      SELECT * FROM profile_facts
      WHERE profile_id = ${profileId}
      ORDER BY confidence DESC
    `;

    return rows.map((r) => ({
      id: r.id as string,
      profile_id: r.profile_id as string,
      key: r.key as string,
      value: r.value as unknown,
      evidence: r.evidence as unknown as string[],
      confidence: r.confidence as number,
      observed_at: r.observed_at as string,
      updated_at: r.updated_at as string,
    }));
  }

  async buildProfileContext(
    workspaceId: WorkspaceId,
    userId: UserId,
  ): Promise<ProfileContext | null> {
    const profile = await this.getProfile(workspaceId, userId);
    if (!profile) return null;

    const profileId = `${workspaceId as string}:${userId}`;
    const [preferences, facts] = await Promise.all([
      this.getPreferences(profileId),
      this.getProfileFacts(profileId),
    ]);

    return {
      workspace_id: workspaceId,
      user_id: userId,
      display_name: profile.display_name,
      preferences: preferences.map(({ id: _id, profile_id: _pid, ...pref }) => pref),
      facts: facts.map(({ profile_id: _pid, ...fact }) => fact),
      behaviour_summary: profile.behaviour_summary,
      last_updated_at: profile.updated_at,
    };
  }

  async updateBehaviourSummary(
    profileId: string,
    summary: Partial<UserProfile["behaviour_summary"]>,
  ): Promise<void> {
    const now = new Date().toISOString();

    const current = await this.#pool.sql<[Record<string, unknown> | undefined]>`
      SELECT behaviour_summary FROM user_profiles WHERE id = ${profileId}
    `;

    const currentSummary = current[0]
      ? (current[0].behaviour_summary as unknown as Record<string, unknown> ?? {})
      : {};

    const updated = { ...currentSummary, ...summary };

    await this.#pool.sql`
      UPDATE user_profiles
      SET behaviour_summary = ${JSON.stringify(updated)},
          updated_at = ${now}
      WHERE id = ${profileId}
    `;
  }

  #mapProfileRow(row: Record<string, unknown>): ProfileRecord {
    const behaviourSummary = typeof row.behaviour_summary === "string"
      ? JSON.parse(row.behaviour_summary as string)
      : (row.behaviour_summary ?? {
          total_searches: 0,
          total_document_views: 0,
          top_search_terms: [],
          top_categories: [],
        });

    return {
      id: row.id as string,
      workspace_id: row.workspace_id as WorkspaceId,
      user_id: row.user_id as UserId,
      display_name: (row.display_name as string) ?? undefined,
      preferences: [],
      facts: [],
      behaviour_summary: behaviourSummary,
      metadata: typeof row.metadata === "string"
        ? JSON.parse(row.metadata as string)
        : (row.metadata as Record<string, unknown> ?? {}),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  #mapBehaviorEventRow(row: Record<string, unknown>): BehaviorEventRecord {
    return {
      id: row.id as string,
      workspace_id: row.workspace_id as WorkspaceId,
      user_id: row.user_id as UserId,
      event_type: row.event_type as string,
      payload: typeof row.payload === "string"
        ? JSON.parse(row.payload as string)
        : (row.payload as Record<string, unknown> ?? {}),
      session_id: (row.session_id as string) ?? undefined,
      occurred_at: row.occurred_at as string,
    };
  }
}

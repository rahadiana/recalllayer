/**
 * Authentication, workspace / tenant, user, and permission types.
 *
 * @module auth
 */

import type { Timestamp, TenantId, UserId, WorkspaceId } from "./common.js";

// ─── Role & Permission ──────────────────────────────────────────────────────

/**
 * Pre-defined roles within a workspace.
 *
 * System roles are enforced by the auth service. Custom roles may be
 * introduced later through a role-management API.
 */
export type Role =
  | "owner"
  | "admin"
  | "editor"
  | "viewer";

/**
 * Fine-grained permission string in `resource:action` format.
 *
 * @example "document:read", "document:write", "workspace:manage"
 */
export type Permission = string;

// ─── Workspace ───────────────────────────────────────────────────────────────

/**
 * A workspace (tenant) represents a logically isolated environment
 * containing documents, indexes, graphs, profiles, and configuration.
 */
export interface Workspace {
  /** Unique workspace identifier (branded). */
  id: WorkspaceId;
  /** Human-readable workspace name. */
  name: string;
  /** Optional workspace description. */
  description?: string;
  /** Tenant this workspace belongs to. */
  tenant_id: TenantId;
  /** Workspace creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
  /** Whether the workspace is active or soft-deleted. */
  is_active: boolean;
}

// ─── User ────────────────────────────────────────────────────────────────────

/**
 * A platform user.
 *
 * Users are global across tenants; workspace membership is managed
 * through membership records.
 */
export interface User {
  /** Globally unique user identifier. */
  id: UserId;
  /** Display name. */
  name: string;
  /** Email address used for login. */
  email: string;
  /** Optional avatar URL. */
  avatar_url?: string;
  /** Account creation timestamp. */
  created_at: Timestamp;
  /** Last update timestamp. */
  updated_at: Timestamp;
  /** Whether the user account is active. */
  is_active: boolean;
}

/**
 * User membership within a workspace, including role and permissions.
 */
export interface WorkspaceMembership {
  /** Workspace the user belongs to. */
  workspace_id: WorkspaceId;
  /** User identifier. */
  user_id: UserId;
  /** Assigned role within the workspace. */
  role: Role;
  /** Fine-grained permissions override. */
  permissions: Permission[];
  /** When the user joined the workspace. */
  joined_at: Timestamp;
}

// ─── API Key ─────────────────────────────────────────────────────────────────

/**
 * API key used for machine-to-machine authentication.
 */
export interface ApiKey {
  /** Unique key identifier. */
  id: string;
  /** Workspace the key is scoped to. */
  workspace_id: WorkspaceId;
  /** Optional human-readable label. */
  label?: string;
  /** Hashed key prefix (for display / identification). */
  prefix: string;
  /** SHA-256 hash of the full key. */
  hash: string;
  /** Assigned permissions (scoped within workspace). */
  permissions: Permission[];
  /** Expiration timestamp, or `null` for non-expiring keys. */
  expires_at: Timestamp | null;
  /** Creation timestamp. */
  created_at: Timestamp;
  /** Last-used timestamp. */
  last_used_at?: Timestamp;
  /** Whether the key is currently active. */
  is_active: boolean;
}

/**
 * Payload returned when creating a new API key (plain-text key is
 * only returned once).
 */
export interface ApiKeyCreated {
  /** The API key metadata. */
  api_key: ApiKey;
  /** The plain-text key – **store securely, never logged**. */
  raw_key: string;
}

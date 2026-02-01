/**
 * Test fixtures for sessions, participants, and related entities.
 */

import type {
  SessionRow,
  ParticipantRow,
  MessageRow,
  SandboxRow,
  EventRow,
  ArtifactRow,
} from "../../session/types";
import type { CreateSessionRequest } from "../../types";

/**
 * Factory function to create a session row with default values.
 */
export function createSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = Date.now();
  return {
    id: "session-123",
    session_name: null,
    title: "Test Session",
    repo_owner: "octocat",
    repo_name: "hello-world",
    repo_default_branch: "main",
    branch_name: null,
    base_sha: null,
    current_sha: null,
    opencode_session_id: null,
    model: "claude-haiku-4-5",
    status: "created",
    created_at: now,
    updated_at: now,
    linear_issue_id: null,
    linear_team_id: null,
    ...overrides,
  };
}

/**
 * Factory function to create a participant row.
 */
export function createParticipantRow(overrides: Partial<ParticipantRow> = {}): ParticipantRow {
  const now = Date.now();
  return {
    id: "participant-123",
    user_id: "user-123",
    github_user_id: "12345",
    github_login: "testuser",
    github_email: "test@example.com",
    github_name: "Test User",
    role: "owner",
    github_access_token_encrypted: null,
    github_refresh_token_encrypted: null,
    github_token_expires_at: null,
    ws_auth_token: null,
    ws_token_created_at: null,
    joined_at: now,
    ...overrides,
  };
}

/**
 * Factory function to create a message row.
 */
export function createMessageRow(overrides: Partial<MessageRow> = {}): MessageRow {
  const now = Date.now();
  return {
    id: "message-123",
    author_id: "participant-123",
    content: "Fix the authentication bug",
    source: "web",
    model: null,
    attachments: null,
    callback_context: null,
    status: "pending",
    error_message: null,
    created_at: now,
    started_at: null,
    completed_at: null,
    ...overrides,
  };
}

/**
 * Factory function to create a sandbox row.
 */
export function createSandboxRow(overrides: Partial<SandboxRow> = {}): SandboxRow {
  const now = Date.now();
  return {
    id: "sandbox-123",
    modal_sandbox_id: "modal-sandbox-123",
    modal_object_id: null,
    snapshot_id: null,
    snapshot_image_id: null,
    auth_token: "sandbox-token-123",
    status: "pending",
    git_sync_status: "pending",
    last_heartbeat: null,
    last_activity: null,
    created_at: now,
    preview_tunnel_url: null,
    tunnel_urls: null,
    ...overrides,
  };
}

/**
 * Factory function to create an event row.
 */
export function createEventRow(overrides: Partial<EventRow> = {}): EventRow {
  const now = Date.now();
  return {
    id: "event-123",
    type: "tool_call",
    data: JSON.stringify({ tool: "bash", args: {} }),
    message_id: "message-123",
    created_at: now,
    ...overrides,
  };
}

/**
 * Factory function to create an artifact row.
 */
export function createArtifactRow(overrides: Partial<ArtifactRow> = {}): ArtifactRow {
  const now = Date.now();
  return {
    id: "artifact-123",
    type: "pr",
    url: "https://github.com/octocat/hello-world/pull/1",
    metadata: JSON.stringify({ prNumber: 1 }),
    created_at: now,
    ...overrides,
  };
}

/**
 * Factory function to create a session creation request.
 */
export function createSessionRequest(
  overrides: Partial<CreateSessionRequest> = {}
): CreateSessionRequest {
  return {
    repoOwner: "octocat",
    repoName: "hello-world",
    title: "Test Session",
    model: "claude-haiku-4-5",
    ...overrides,
  };
}

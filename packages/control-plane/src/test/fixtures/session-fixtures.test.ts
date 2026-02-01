/**
 * Tests for session fixtures.
 */

import { describe, it, expect } from "vitest";
import {
  createSessionRow,
  createParticipantRow,
  createMessageRow,
  createSandboxRow,
  createEventRow,
  createArtifactRow,
  createSessionRequest,
} from "./session-fixtures";

describe("Session fixtures", () => {
  it("createSessionRow should create valid session with defaults", () => {
    const session = createSessionRow();

    expect(session.id).toBe("session-123");
    expect(session.repo_owner).toBe("octocat");
    expect(session.repo_name).toBe("hello-world");
    expect(session.status).toBe("created");
    expect(session.model).toBe("claude-haiku-4-5");
  });

  it("createSessionRow should accept overrides", () => {
    const session = createSessionRow({
      id: "custom-id",
      title: "Custom Title",
      status: "active",
    });

    expect(session.id).toBe("custom-id");
    expect(session.title).toBe("Custom Title");
    expect(session.status).toBe("active");
    expect(session.repo_owner).toBe("octocat"); // Default preserved
  });

  it("createParticipantRow should create valid participant", () => {
    const participant = createParticipantRow();

    expect(participant.id).toBe("participant-123");
    expect(participant.user_id).toBe("user-123");
    expect(participant.github_login).toBe("testuser");
    expect(participant.role).toBe("owner");
  });

  it("createMessageRow should create valid message", () => {
    const message = createMessageRow();

    expect(message.id).toBe("message-123");
    expect(message.content).toBe("Fix the authentication bug");
    expect(message.source).toBe("web");
    expect(message.status).toBe("pending");
  });

  it("createSandboxRow should create valid sandbox", () => {
    const sandbox = createSandboxRow();

    expect(sandbox.id).toBe("sandbox-123");
    expect(sandbox.status).toBe("pending");
    expect(sandbox.git_sync_status).toBe("pending");
  });

  it("createEventRow should create valid event", () => {
    const event = createEventRow();

    expect(event.id).toBe("event-123");
    expect(event.type).toBe("tool_call");
    expect(event.message_id).toBe("message-123");
  });

  it("createArtifactRow should create valid artifact", () => {
    const artifact = createArtifactRow();

    expect(artifact.id).toBe("artifact-123");
    expect(artifact.type).toBe("pr");
    expect(artifact.url).toBe("https://github.com/octocat/hello-world/pull/1");
  });

  it("createSessionRequest should create valid request", () => {
    const request = createSessionRequest();

    expect(request.repoOwner).toBe("octocat");
    expect(request.repoName).toBe("hello-world");
    expect(request.model).toBe("claude-haiku-4-5");
  });

  it("createSessionRequest should accept overrides", () => {
    const request = createSessionRequest({
      repoOwner: "custom-owner",
      model: "claude-sonnet-4-5",
    });

    expect(request.repoOwner).toBe("custom-owner");
    expect(request.model).toBe("claude-sonnet-4-5");
    expect(request.repoName).toBe("hello-world"); // Default preserved
  });
});

/**
 * Tests for FakeModalClient.
 */

import { describe, it, expect } from "vitest";
import { FakeModalClient } from "./fake-modal-client";

describe("FakeModalClient", () => {
  it("should record createSandbox calls", async () => {
    const client = new FakeModalClient();

    const request = {
      sessionId: "session-123",
      repoUrl: "https://github.com/octocat/hello-world",
      branchName: "main",
      authToken: "token-123",
      model: "claude-haiku-4-5",
    };

    await client.createSandbox(request);

    expect(client.createSandboxCalls).toHaveLength(1);
    expect(client.createSandboxCalls[0]).toEqual(request);
  });

  it("should return configured createSandbox response", async () => {
    const client = new FakeModalClient();
    client.createSandboxResponse = {
      sandboxId: "custom-sandbox",
      status: "spawning",
      tunnelUrl: "https://custom.example.com",
    };

    const result = await client.createSandbox({
      sessionId: "session-123",
      repoUrl: "https://github.com/octocat/hello-world",
      branchName: "main",
      authToken: "token-123",
      model: "claude-haiku-4-5",
    });

    expect(result).toEqual({
      sandboxId: "custom-sandbox",
      status: "spawning",
      tunnelUrl: "https://custom.example.com",
    });
  });

  it("should record snapshot calls", async () => {
    const client = new FakeModalClient();

    await client.snapshot("sandbox-123", "manual");

    expect(client.snapshotCalls).toHaveLength(1);
    expect(client.snapshotCalls[0]).toEqual({
      sandboxId: "sandbox-123",
      reason: "manual",
    });
  });

  it("should record restore calls", async () => {
    const client = new FakeModalClient();

    await client.restore("snapshot-123");

    expect(client.restoreCalls).toHaveLength(1);
    expect(client.restoreCalls[0]).toEqual({ snapshotId: "snapshot-123" });
  });

  it("should clear all recorded calls", async () => {
    const client = new FakeModalClient();

    await client.createSandbox({
      sessionId: "session-123",
      repoUrl: "https://github.com/octocat/hello-world",
      branchName: "main",
      authToken: "token-123",
      model: "claude-haiku-4-5",
    });
    await client.snapshot("sandbox-123", "manual");
    await client.restore("snapshot-123");

    expect(client.createSandboxCalls).toHaveLength(1);
    expect(client.snapshotCalls).toHaveLength(1);
    expect(client.restoreCalls).toHaveLength(1);

    client.clearCalls();

    expect(client.createSandboxCalls).toHaveLength(0);
    expect(client.snapshotCalls).toHaveLength(0);
    expect(client.restoreCalls).toHaveLength(0);
  });
});

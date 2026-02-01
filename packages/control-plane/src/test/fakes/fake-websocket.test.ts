/**
 * Tests for FakeWebSocket.
 */

import { describe, it, expect } from "vitest";
import { FakeWebSocket } from "./fake-websocket";

describe("FakeWebSocket", () => {
  it("should record sent messages", () => {
    const ws = new FakeWebSocket();

    ws.send(JSON.stringify({ type: "pong", timestamp: 123 }));
    ws.send(JSON.stringify({ type: "error", code: "test", message: "Test error" }));

    expect(ws.messages).toHaveLength(2);
    expect(ws.messages[0]).toEqual({ type: "pong", timestamp: 123 });
    expect(ws.messages[1]).toEqual({
      type: "error",
      code: "test",
      message: "Test error",
    });
  });

  it("should return last message", () => {
    const ws = new FakeWebSocket();

    ws.send(JSON.stringify({ type: "pong", timestamp: 123 }));
    ws.send(JSON.stringify({ type: "error", code: "test", message: "Test" }));

    expect(ws.lastMessage).toEqual({
      type: "error",
      code: "test",
      message: "Test",
    });
  });

  it("should clear messages", () => {
    const ws = new FakeWebSocket();

    ws.send(JSON.stringify({ type: "pong", timestamp: 123 }));
    expect(ws.messages).toHaveLength(1);

    ws.clearMessages();
    expect(ws.messages).toHaveLength(0);
  });

  it("should have readyState OPEN initially", () => {
    const ws = new FakeWebSocket();
    expect(ws.readyState).toBe(1); // OPEN
  });

  it("should change readyState when closed", async () => {
    const ws = new FakeWebSocket();

    let closed = false;
    ws.addEventListener("close", () => {
      closed = true;
    });

    ws.close();
    expect(ws.readyState).toBe(2); // CLOSING

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ws.readyState).toBe(3); // CLOSED
    expect(closed).toBe(true);
  });

  it("should throw error when sending on closed socket", async () => {
    const ws = new FakeWebSocket();
    ws.close();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(() => {
      ws.send(JSON.stringify({ type: "test" }));
    }).toThrow("WebSocket is not open");
  });

  it("should trigger error handlers", () => {
    const ws = new FakeWebSocket();

    let errorReceived: Error | null = null;
    ws.addEventListener("error", (error) => {
      errorReceived = error;
    });

    const testError = new Error("Test error");
    ws.simulateError(testError);

    expect(errorReceived).toBe(testError);
  });

  it("should ignore non-JSON messages", () => {
    const ws = new FakeWebSocket();

    ws.send("not json");
    expect(ws.messages).toHaveLength(0);
  });
});

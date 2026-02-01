/**
 * Fake WebSocket implementation for testing.
 */

import type { ServerMessage } from "../../types";

export class FakeWebSocket {
  private _messages: ServerMessage[] = [];
  private _readyState: number = 1; // OPEN
  private _closeHandlers: Array<() => void> = [];
  private _errorHandlers: Array<(error: Error) => void> = [];

  /** Messages sent through this WebSocket */
  get messages(): ServerMessage[] {
    return [...this._messages];
  }

  /** Get the last message sent */
  get lastMessage(): ServerMessage | undefined {
    return this._messages[this._messages.length - 1];
  }

  /** Clear recorded messages */
  clearMessages(): void {
    this._messages = [];
  }

  /** Simulate sending a message */
  send(data: string | ArrayBuffer): void {
    if (this._readyState !== 1) {
      throw new Error("WebSocket is not open");
    }

    if (typeof data === "string") {
      try {
        const message = JSON.parse(data) as ServerMessage;
        this._messages.push(message);
      } catch {
        // Ignore non-JSON messages
      }
    }
  }

  /** Simulate closing the WebSocket */
  close(_code?: number, _reason?: string): void {
    this._readyState = 2; // CLOSING
    setTimeout(() => {
      this._readyState = 3; // CLOSED
      this._closeHandlers.forEach((handler) => handler());
    }, 0);
  }

  /** WebSocket readyState */
  get readyState(): number {
    return this._readyState;
  }

  /** Simulate an error */
  simulateError(error: Error): void {
    this._errorHandlers.forEach((handler) => handler(error));
  }

  /** Add close event listener */
  addEventListener(event: "close", handler: () => void): void;
  addEventListener(event: "error", handler: (error: Error) => void): void;
  addEventListener(event: string, handler: (() => void) | ((error: Error) => void)): void {
    if (event === "close") {
      this._closeHandlers.push(handler as () => void);
    } else if (event === "error") {
      this._errorHandlers.push(handler as (error: Error) => void);
    }
  }

  /** Remove event listener */
  removeEventListener(event: string, handler: (() => void) | ((error: Error) => void)): void {
    if (event === "close") {
      this._closeHandlers = this._closeHandlers.filter((h) => h !== handler);
    } else if (event === "error") {
      this._errorHandlers = this._errorHandlers.filter((h) => h !== handler);
    }
  }
}

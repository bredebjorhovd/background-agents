/**
 * WebSocketManager implementation.
 */

import type { WebSocketManager } from "./types";
import type { ClientInfo } from "../../types";

/**
 * Create a WebSocketManager instance.
 */
export function createWebSocketManager(): WebSocketManager {
  const clients = new Map<WebSocket, ClientInfo>();
  let sandboxWebSocket: WebSocket | null = null;

  return {
    getClients(): Map<WebSocket, ClientInfo> {
      return clients;
    },

    registerClient(ws: WebSocket, clientInfo: ClientInfo): void {
      clients.set(ws, clientInfo);
    },

    removeClient(ws: WebSocket): void {
      clients.delete(ws);
    },

    getSandboxWebSocket(): WebSocket | null {
      return sandboxWebSocket;
    },

    setSandboxWebSocket(ws: WebSocket | null): void {
      sandboxWebSocket = ws;
    },

    safeSend(ws: WebSocket, message: object | string): boolean {
      try {
        if (ws.readyState !== WebSocket.OPEN) {
          return false;
        }

        const payload = typeof message === "string" ? message : JSON.stringify(message);
        ws.send(payload);
        return true;
      } catch (error) {
        console.error("Failed to send WebSocket message:", error);
        return false;
      }
    },

    broadcast(message: object): void {
      const payload = JSON.stringify(message);
      for (const [ws] of clients) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
          }
        } catch (error) {
          console.error("Failed to broadcast to client:", error);
        }
      }
    },
  };
}

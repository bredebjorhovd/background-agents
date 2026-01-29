/**
 * Start Preview / Get Preview URL Tool for Open-Inspect.
 *
 * Gets the live preview tunnel URL for this session (exposed at sandbox creation).
 * The preview link appears in the session sidebar; start the dev server (e.g. pnpm dev)
 * in the repo root so the link serves your app.
 */
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"

const BRIDGE_URL = process.env.CONTROL_PLANE_URL || "http://localhost:8787"
const BRIDGE_TOKEN = process.env.SANDBOX_AUTH_TOKEN || ""

function getSessionId() {
  try {
    const config = JSON.parse(process.env.SESSION_CONFIG || "{}")
    return config.sessionId || config.session_id || ""
  } catch {
    return ""
  }
}

export default tool({
  name: "start-preview",
  description:
    "Get the live preview URL for this session. The preview link is already available in the session sidebar (View preview). Use this tool to get the URL so you can tell the user, or to register it if needed. The user should start the dev server first (e.g. pnpm dev or npm run dev) in the repo root so the preview link serves the app.",
  args: {},
  async execute() {
    const sessionId = getSessionId()
    if (!sessionId) {
      return {
        content: "Failed to get preview URL: Session ID not found in environment (SESSION_CONFIG).",
        success: false,
      }
    }
    if (!BRIDGE_TOKEN) {
      return {
        content: "Failed to get preview URL: Sandbox auth token not set.",
        success: false,
      }
    }

    try {
      const response = await fetch(`${BRIDGE_URL}/sessions/${sessionId}/preview-url`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${BRIDGE_TOKEN}` },
      })

      if (!response.ok) {
        const errText = await response.text()
        return {
          content: `Failed to get preview URL: ${errText}`,
          success: false,
        }
      }

      const result = await response.json()
      const url = result?.url

      if (!url) {
        return {
          content:
            "No preview URL available for this session. The preview tunnel may not have been created.",
          success: false,
        }
      }

      return {
        content: `Live preview is available at: ${url}\n\nStart the dev server in the repo root (e.g. \`pnpm dev\` or \`npm run dev\`) if you haven't already; then open the link. The "View preview" button in the session sidebar uses this URL.`,
        success: true,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        content: `Failed to get preview URL: ${message}`,
        success: false,
      }
    }
  },
})

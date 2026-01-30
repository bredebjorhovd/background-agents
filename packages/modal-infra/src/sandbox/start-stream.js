/**
 * Start Screenshot Stream Tool for Open-Inspect.
 *
 * This tool starts a background process that captures screenshots from
 * a target URL (typically the dev server) and streams them to the control
 * plane for real-time viewing by the user.
 *
 * Use this to let users watch the agent's work in real-time.
 */
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { spawn, execSync } from "child_process"

const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || "http://localhost:8787"
const AUTH_TOKEN = process.env.SANDBOX_AUTH_TOKEN || ""

function getSessionId() {
  try {
    const config = JSON.parse(process.env.SESSION_CONFIG || "{}")
    return config.sessionId || config.session_id || ""
  } catch {
    return ""
  }
}

/**
 * Check if a streamer is already running for this port.
 */
function isStreamerRunning(port) {
  try {
    execSync(`pgrep -f "screenshot_streamer.*--target-url.*:${port}"`, { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

/**
 * Start the screenshot streamer in the background.
 */
function startStreamer(targetUrl, sessionId, interval, width, height, quality) {
  const child = spawn(
    "python",
    [
      "-m",
      "sandbox.screenshot_streamer",
      "--target-url",
      targetUrl,
      "--control-plane-url",
      CONTROL_PLANE_URL,
      "--session-id",
      sessionId,
      "--auth-token",
      AUTH_TOKEN,
      "--interval",
      String(interval),
      "--width",
      String(width),
      "--height",
      String(height),
      "--quality",
      String(quality),
    ],
    {
      detached: true,
      stdio: "ignore",
      cwd: "/app", // Where the Python modules are installed
    }
  )
  child.unref()

  return { started: true, pid: child.pid }
}

/**
 * Stop any running streamer for this port.
 */
function stopStreamer(port) {
  try {
    execSync(`pkill -f "screenshot_streamer.*--target-url.*:${port}"`, { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

export default tool({
  name: "start-stream",
  description: `Start a real-time screenshot stream of your development preview.

This tool captures screenshots from your dev server at regular intervals and 
streams them to the session viewer, allowing users to watch the agent's work 
in real-time.

IMPORTANT: Use your app's dev server URL, e.g. http://localhost:5173 (Vite) or 
http://localhost:3000 (Next.js). Do NOT use port 8080 — that is for VS Code.

Features:
- Automatic screenshot capture at configurable intervals
- Skip unchanged frames (efficient bandwidth usage)
- Adjustable quality and viewport size
- Background process that runs alongside other work

Use cases:
- Show users what the app looks like as changes are made
- Demonstrate UI changes in real-time
- Debug visual issues collaboratively
- Create before/after comparisons automatically

Note: The dev server must be running first (e.g. on port 5173). Use start-preview before this.`,
  args: {
    targetUrl: z
      .string()
      .optional()
      .describe(
        "URL to stream from — use dev server, e.g. http://localhost:5173 (default). Not port 8080."
      ),
    interval: z
      .number()
      .optional()
      .describe("Seconds between screenshots (default: 2.0)"),
    width: z.number().optional().describe("Viewport width (default: 1280)"),
    height: z.number().optional().describe("Viewport height (default: 720)"),
    quality: z.number().optional().describe("JPEG quality 0-100 (default: 80)"),
    stop: z.boolean().optional().describe("Stop the streamer instead of starting it"),
  },
  async execute({
    targetUrl = "http://localhost:5173",
    interval = 2.0,
    width = 1280,
    height = 720,
    quality = 80,
    stop = false,
  }) {
    const sessionId = getSessionId()
    if (!sessionId) {
      return {
        content: "Failed: Session ID not found in environment.",
        success: false,
      }
    }

    // Extract port from URL for process detection
    const portMatch = targetUrl.match(/:(\d+)/)
    const port = portMatch ? portMatch[1] : "5173"

    if (stop) {
      const stopped = stopStreamer(port)
      return {
        content: stopped
          ? `Screenshot stream stopped for port ${port}.`
          : `No streamer running for port ${port}.`,
        success: true,
      }
    }

    // Check if already running
    if (isStreamerRunning(port)) {
      return {
        content: `Screenshot streamer is already running for port ${port}. Use { stop: true } to stop it first.`,
        success: true,
        alreadyRunning: true,
      }
    }

    // Start the streamer
    const result = startStreamer(targetUrl, sessionId, interval, width, height, quality)

    if (result.started) {
      return {
        content: [
          `✅ Screenshot stream started!`,
          ``,
          `**Target URL:** ${targetUrl}`,
          `**Interval:** ${interval}s`,
          `**Viewport:** ${width}x${height}`,
          `**Quality:** ${quality}%`,
          ``,
          `Screenshots are being streamed to the session viewer.`,
          `Users can see the "Agent View" tab to watch in real-time.`,
          ``,
          `To stop: call this tool with { stop: true }`,
        ].join("\n"),
        success: true,
        pid: result.pid,
      }
    } else {
      return {
        content: "Failed to start screenshot streamer.",
        success: false,
      }
    }
  },
})

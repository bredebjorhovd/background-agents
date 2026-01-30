/**
 * Take Screenshot Tool for Open-Inspect.
 *
 * Captures a screenshot of a URL (e.g. local dev server) using Playwright and uploads
 * it to the control plane as a session artifact. Uses a Python helper script that
 * runs in the sandbox (Playwright is installed via pip in the image).
 */
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { execFileSync } from "node:child_process"
import { readFileSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

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
  name: "take-screenshot",
  description:
    "Capture a screenshot of a web page (e.g. your local dev server at http://localhost:5173) and save it as a session artifact. Use this to visually verify frontend changes. The URL must be reachable from the sandbox (use localhost for a dev server running in the same sandbox).",
  args: {
    url: z.string().describe("URL to capture (e.g. http://localhost:5173 or http://localhost:3000)"),
    fullPage: z.boolean().optional().describe("Capture the full scrollable page. Default: false"),
    viewportWidth: z.number().optional().describe("Viewport width in pixels. Default: 1280"),
    viewportHeight: z.number().optional().describe("Viewport height in pixels. Default: 720"),
  },
  async execute(args) {
    const sessionId = getSessionId()
    if (!sessionId) {
      return {
        content: "Failed to take screenshot: Session ID not found in environment (SESSION_CONFIG).",
        success: false,
      }
    }
    if (!BRIDGE_TOKEN) {
      return {
        content: "Failed to take screenshot: Sandbox auth token not set.",
        success: false,
      }
    }

    const url = args.url || "http://localhost:5173"
    const dir = mkdtempSync(join(tmpdir(), "screenshot-"))
    const outputPath = join(dir, "screenshot.png")

    try {
      const scriptPath = "/app/sandbox/take_screenshot.py"
      const execArgs = [
        scriptPath,
        url,
        outputPath,
        ...(args.fullPage ? ["--full-page"] : []),
        ...(args.viewportWidth != null ? ["--viewport-width", String(args.viewportWidth)] : []),
        ...(args.viewportHeight != null ? ["--viewport-height", String(args.viewportHeight)] : []),
      ]
      execFileSync("python3", execArgs, { stdio: "pipe", timeout: 35000 })

      const buffer = readFileSync(outputPath)
      const form = new FormData()
      form.append("file", new Blob([buffer], { type: "image/png" }), "screenshot.png")
      form.append("type", "screenshot")
      const metadata = { url, fullPage: args.fullPage ?? false }
      form.append("metadata", JSON.stringify(metadata))

      const response = await fetch(`${BRIDGE_URL}/sessions/${sessionId}/artifacts`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${BRIDGE_TOKEN}` },
        body: form,
      })

      if (!response.ok) {
        const errText = await response.text()
        let errMsg = errText
        try {
          const j = JSON.parse(errText)
          errMsg = j.error || errText
        } catch {}
        return {
          content: `Failed to upload screenshot: ${errMsg}`,
          success: false,
        }
      }

      const result = await response.json()
      return {
        content: `Screenshot saved. View it in the session: ${result.url}`,
        success: true,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        content: `Failed to take screenshot: ${message}. Ensure the URL is reachable (e.g. start the dev server first with pnpm dev or npm run dev).`,
        success: false,
      }
    } finally {
      try {
        rmSync(dir, { recursive: true })
      } catch {}
    }
  },
})

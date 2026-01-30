/**
 * Start VS Code (code-server) Tool for Open-Inspect.
 *
 * This tool starts code-server (VS Code in browser) and returns the URL.
 * code-server runs on port 8080 which is already exposed via Modal tunnels.
 */
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { spawn, execSync } from "child_process"
import { existsSync, writeFileSync } from "fs"

const BRIDGE_URL = process.env.CONTROL_PLANE_URL || "http://localhost:8787"
const BRIDGE_TOKEN = process.env.SANDBOX_AUTH_TOKEN || ""
const CODE_SERVER_PORT = 8080

function getSessionId() {
  try {
    const config = JSON.parse(process.env.SESSION_CONFIG || "{}")
    return config.sessionId || config.session_id || ""
  } catch {
    return ""
  }
}

/**
 * Check if code-server is already running.
 */
function isCodeServerRunning() {
  try {
    execSync(`pgrep -f "code-server.*--port ${CODE_SERVER_PORT}"`, { stdio: "pipe" })
    return true
  } catch {
    return false
  }
}

/**
 * Start code-server in the background.
 */
function startCodeServer(workdir) {
  // Overwrite config so auth is always disabled (image also has default; we rely on Modal tunnel as auth)
  const configPath = "/root/.config/code-server/config.yaml"
  const config = `bind-addr: 0.0.0.0:${CODE_SERVER_PORT}
auth: none
cert: false
`
  writeFileSync(configPath, config)

  const env = { ...process.env }
  env.CODE_SERVER_AUTH = "none"
  delete env.PASSWORD
  delete env.PASSWORD_HASH
  delete env.HASHED_PASSWORD

  // Start code-server (--auth none + config + env so no password prompt)
  const child = spawn(
    "code-server",
    [
      "--port",
      String(CODE_SERVER_PORT),
      "--host",
      "0.0.0.0",
      "--auth",
      "none",
      "--disable-telemetry",
      "--disable-update-check",
      workdir,
    ],
    {
      detached: true,
      stdio: "ignore",
      env,
    }
  )
  child.unref()

  return { started: true, pid: child.pid }
}

/**
 * Wait for code-server to be ready.
 * Tries /healthz first (code-server 3.6+), then GET / as fallback.
 */
async function waitForCodeServer(maxWaitMs = 45000) {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    for (const path of ["/healthz", "/"]) {
      try {
        const response = await fetch(
          `http://127.0.0.1:${CODE_SERVER_PORT}${path}`,
          {
            method: "GET",
            signal: AbortSignal.timeout(3000),
            redirect: "follow",
          }
        )
        if (response.ok || response.status === 302) {
          return { ready: true }
        }
      } catch {
        // Not ready yet
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  return { ready: false }
}

/**
 * Get the VS Code URL from the control plane (port 8080).
 * If not stored, try to derive from the preview URL (5173) — Modal tunnel hostnames
 * often use -PORT in the subdomain (e.g. xxx-5173... and xxx-8080...).
 */
async function getVscodeUrl(sessionId) {
  const opts = {
    method: "GET",
    headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
  }

  try {
    const res = await fetch(
      `${BRIDGE_URL}/sessions/${sessionId}/preview-url?port=${CODE_SERVER_PORT}`,
      opts
    )
    if (!res.ok) {
      const errText = await res.text()
      return { url: null, error: `preview-url (8080): ${errText}` }
    }
    const result = await res.json()
    if (result?.url && !result.url.includes("localhost")) {
      return { url: result.url, error: null }
    }
  } catch (e) {
    return { url: null, error: `getVscodeUrl: ${e.message}` }
  }

  // Fallback: get preview URL (5173) and derive 8080 URL from hostname
  try {
    const res = await fetch(
      `${BRIDGE_URL}/sessions/${sessionId}/preview-url`,
      opts
    )
    if (!res.ok) return { url: null, error: "preview-url (default) failed" }
    const result = await res.json()
    const previewUrl = result?.url
    if (!previewUrl || previewUrl.includes("localhost")) {
      return { url: null, error: "No tunnel URL for 8080 or 5173" }
    }
    const derived = derivePortUrl(previewUrl, 5173, CODE_SERVER_PORT)
    if (derived) return { url: derived, error: null }
  } catch (e) {
    // ignore
  }

  return { url: null, error: "Tunnel URL for port 8080 not available" }
}

/**
 * Derive URL for another port from a known tunnel URL by replacing port in hostname.
 * Modal often uses hostnames like xxx-5173.wo-xxx.w.modal.host → xxx-8080.wo-xxx.w.modal.host
 */
function derivePortUrl(urlStr, fromPort, toPort) {
  try {
    const u = new URL(urlStr)
    const host = u.hostname
    const fromSeg = `-${fromPort}`
    const toSeg = `-${toPort}`
    if (!host.includes(fromSeg)) return null
    const newHost = host.replace(fromSeg, toSeg)
    u.hostname = newHost
    return u.toString()
  } catch {
    return null
  }
}

export default tool({
  name: "start-vscode",
  description: `Start VS Code (code-server) in the browser.

This tool starts a web-based VS Code editor that runs in the sandbox.
The VS Code instance has full access to the repository files and terminal.

Features:
- Full VS Code experience in the browser
- File editing, search, integrated terminal
- Extension support (limited to web extensions)
- No authentication required (handled by Modal tunnel)

Use this when:
- The user wants to edit files directly
- Complex multi-file edits are needed
- The user prefers a visual editor over CLI`,
  args: {
    workdir: z
      .string()
      .optional()
      .describe("Working directory to open in VS Code (default: repository root)"),
  },
  async execute({ workdir }) {
    try {
      const sessionId = getSessionId()
      if (!sessionId) {
        return {
          content: "Failed to start VS Code: Session ID not found in environment.",
          success: false,
        }
      }

      // Open the same repo that Preview uses: /workspace/<REPO_NAME> (set by sandbox entrypoint)
      const repoName = process.env.REPO_NAME || ""
      const workspaceRepo = repoName ? `/workspace/${repoName}` : "/workspace"
      const cwd = workdir || (existsSync(workspaceRepo) ? workspaceRepo : "/workspace")
      const steps = []

      // Check if already running
      if (isCodeServerRunning()) {
        steps.push({ step: "check", result: "code-server is already running" })
      } else {
        // Start code-server
        let startResult
        try {
          startResult = startCodeServer(cwd)
        } catch (err) {
          return {
            content: `Failed to start code-server: ${err?.message || err}`,
            success: false,
          }
        }
        steps.push({
          step: "start",
          result: startResult.started ? `Started code-server (PID: ${startResult.pid})` : "Failed to start",
        })

        if (!startResult.started) {
          return {
            content: `Failed to start VS Code:\n${steps.map((s) => `- ${s.step}: ${s.result}`).join("\n")}`,
            success: false,
          }
        }
      }

      // Wait for it to be ready
      const readyResult = await waitForCodeServer()
      steps.push({ step: "ready", result: readyResult.ready ? "VS Code is ready" : "VS Code not responding" })

      // Get the tunnel URL from the control plane (never use localhost for the user)
      const { url: vscodeUrl, error: urlError } = await getVscodeUrl(sessionId)
      if (urlError) {
        steps.push({ step: "url", result: urlError })
      } else {
        steps.push({ step: "url", result: vscodeUrl || "No URL available" })
      }

      // Only return success with a real tunnel URL (https://...modal.host), not localhost
      const hasValidTunnelUrl =
        vscodeUrl && typeof vscodeUrl === "string" && !vscodeUrl.includes("localhost")

      if (!hasValidTunnelUrl) {
        return {
          content: [
            `VS Code (code-server) is running inside the sandbox on port ${CODE_SERVER_PORT}, but the public tunnel URL was not available.`,
            ``,
            `This usually means the control plane does not have the tunnel URL for port ${CODE_SERVER_PORT} stored yet. The sandbox is created with port 8080 exposed; try asking again in a few seconds, or refresh the session.`,
            ``,
            `**Steps completed:**`,
            ...steps.map((s) => `- ${s.step}: ${s.result}`),
          ].join("\n"),
          success: false,
        }
      }

      const summary = [
        `✅ VS Code is ready!`,
        ``,
        `**URL:** ${vscodeUrl}`,
        `**Port:** ${CODE_SERVER_PORT}`,
        `**Working Directory:** ${cwd}`,
        ``,
        `Open the URL above in your browser to use VS Code. If you see "didn't send any data", wait a few seconds and refresh.`,
        ``,
        `**Steps completed:**`,
        ...steps.map((s) => `- ${s.step}: ${s.result}`),
      ].join("\n")

      return {
        content: summary,
        success: true,
        vscodeUrl,
        port: CODE_SERVER_PORT,
      }
    } catch (err) {
      return {
        content: `VS Code tool error: ${err?.message || String(err)}`,
        success: false,
      }
    }
  },
})

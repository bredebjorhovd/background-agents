/**
 * Capture Before/After Screenshots Tool for Open-Inspect.
 *
 * This tool captures screenshots at key moments and stores them as
 * "before" and "after" artifacts. These can be automatically embedded
 * in pull requests to show visual changes.
 *
 * Usage:
 * - Call with mode: "before" at the start of UI work
 * - Call with mode: "after" when UI work is complete
 * - Call with mode: "pr" to generate markdown for PR description
 */
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { execSync } from "child_process"
import { readFileSync, mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

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

/**
 * Capture a screenshot using Playwright.
 */
function captureScreenshot(targetUrl, width = 1280, height = 720) {
  const tempDir = mkdtempSync(join(tmpdir(), "screenshot-"))
  const outputPath = join(tempDir, "screenshot.png")

  try {
    // Use the take_screenshot.py Python script
    execSync(
      `python -m sandbox.take_screenshot "${targetUrl}" "${outputPath}" --width ${width} --height ${height}`,
      {
        cwd: "/app",
        stdio: "pipe",
        timeout: 60000,
      }
    )

    const imageBuffer = readFileSync(outputPath)
    const base64Data = imageBuffer.toString("base64")

    return { success: true, base64Data, error: null }
  } catch (error) {
    return { success: false, base64Data: null, error: error.message }
  } finally {
    // Cleanup
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Upload screenshot to control plane and get artifact info.
 */
async function uploadScreenshot(sessionId, base64Data, label) {
  try {
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, "base64")

    // Create FormData-like structure for the control plane
    const formData = new FormData()
    const blob = new Blob([buffer], { type: "image/png" })
    formData.append("file", blob, `${label}.png`)
    formData.append("type", "screenshot")
    formData.append("label", label)

    const response = await fetch(`${BRIDGE_URL}/sessions/${sessionId}/artifacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BRIDGE_TOKEN}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errText = await response.text()
      return { success: false, url: null, error: `Upload failed: ${errText}` }
    }

    const result = await response.json()
    return {
      success: true,
      url: result.artifact?.url || result.url,
      artifactId: result.artifact?.id || result.id,
      error: null,
    }
  } catch (error) {
    return { success: false, url: null, error: error.message }
  }
}

/**
 * Generate PR markdown with before/after screenshots.
 */
function generatePrMarkdown(beforeUrl, afterUrl, description = "") {
  const lines = []

  if (description) {
    lines.push(description)
    lines.push("")
  }

  lines.push("## Visual Changes")
  lines.push("")
  lines.push("| Before | After |")
  lines.push("|--------|-------|")

  const beforeCell = beforeUrl ? `<img src="${beforeUrl}" width="400" />` : "_No before screenshot_"
  const afterCell = afterUrl ? `<img src="${afterUrl}" width="400" />` : "_No after screenshot_"

  lines.push(`| ${beforeCell} | ${afterCell} |`)

  return lines.join("\n")
}

// Store for before/after state (persists across tool calls in same session)
const captureState = {
  beforeUrl: null,
  afterUrl: null,
  beforeArtifactId: null,
  afterArtifactId: null,
}

export default tool({
  name: "capture-before-after",
  description: `Capture before/after screenshots for visual comparison in PRs.

This tool helps document visual changes by capturing screenshots at key moments:
- **before**: Capture the current state before making UI changes
- **after**: Capture the state after UI changes are complete
- **pr**: Generate markdown for embedding in a PR description

The screenshots are automatically uploaded and can be embedded in PRs to show
what changed visually.

Workflow:
1. Call with mode: "before" when starting UI work
2. Make your UI changes
3. Call with mode: "after" when done
4. Call with mode: "pr" to get markdown for PR description

Note: The dev server must be running. Use start-preview first if needed.`,
  args: {
    mode: z
      .enum(["before", "after", "pr", "both"])
      .describe("Capture mode: before, after, pr (get markdown), or both (quick comparison)"),
    targetUrl: z
      .string()
      .optional()
      .describe("URL to capture (default: http://localhost:5173)"),
    description: z.string().optional().describe("Description for PR markdown (mode: pr only)"),
    width: z.number().optional().describe("Viewport width (default: 1280)"),
    height: z.number().optional().describe("Viewport height (default: 720)"),
  },
  async execute({
    mode,
    targetUrl = "http://localhost:5173",
    description = "",
    width = 1280,
    height = 720,
  }) {
    const sessionId = getSessionId()
    if (!sessionId) {
      return {
        content: "Failed: Session ID not found in environment.",
        success: false,
      }
    }

    // PR mode - just generate markdown from existing captures
    if (mode === "pr") {
      if (!captureState.beforeUrl && !captureState.afterUrl) {
        return {
          content:
            "No before/after screenshots captured yet. Use mode: 'before' and 'after' first.",
          success: false,
        }
      }

      const markdown = generatePrMarkdown(captureState.beforeUrl, captureState.afterUrl, description)

      return {
        content: [
          "## PR Markdown Generated",
          "",
          "Copy the following markdown into your PR description:",
          "",
          "```markdown",
          markdown,
          "```",
          "",
          "Before URL: " + (captureState.beforeUrl || "Not captured"),
          "After URL: " + (captureState.afterUrl || "Not captured"),
        ].join("\n"),
        success: true,
        markdown,
        beforeUrl: captureState.beforeUrl,
        afterUrl: captureState.afterUrl,
      }
    }

    // Capture screenshot(s)
    const results = []

    if (mode === "before" || mode === "both") {
      const captureResult = captureScreenshot(targetUrl, width, height)
      if (!captureResult.success) {
        return {
          content: `Failed to capture 'before' screenshot: ${captureResult.error}`,
          success: false,
        }
      }

      const uploadResult = await uploadScreenshot(sessionId, captureResult.base64Data, "before")
      if (!uploadResult.success) {
        return {
          content: `Failed to upload 'before' screenshot: ${uploadResult.error}`,
          success: false,
        }
      }

      captureState.beforeUrl = uploadResult.url
      captureState.beforeArtifactId = uploadResult.artifactId
      results.push({ label: "before", url: uploadResult.url })
    }

    if (mode === "after" || mode === "both") {
      const captureResult = captureScreenshot(targetUrl, width, height)
      if (!captureResult.success) {
        return {
          content: `Failed to capture 'after' screenshot: ${captureResult.error}`,
          success: false,
        }
      }

      const uploadResult = await uploadScreenshot(sessionId, captureResult.base64Data, "after")
      if (!uploadResult.success) {
        return {
          content: `Failed to upload 'after' screenshot: ${uploadResult.error}`,
          success: false,
        }
      }

      captureState.afterUrl = uploadResult.url
      captureState.afterArtifactId = uploadResult.artifactId
      results.push({ label: "after", url: uploadResult.url })
    }

    // Build response
    const summary = results.map((r) => `- **${r.label}**: ${r.url}`).join("\n")

    let nextStep = ""
    if (mode === "before") {
      nextStep = "\n\nNext: Make your UI changes, then call with mode: 'after'."
    } else if (mode === "after" && captureState.beforeUrl) {
      nextStep = "\n\nBoth screenshots captured! Call with mode: 'pr' to generate markdown."
    } else if (mode === "both") {
      const markdown = generatePrMarkdown(captureState.beforeUrl, captureState.afterUrl, "")
      nextStep = [
        "\n\n## Quick PR Markdown",
        "",
        "```markdown",
        markdown,
        "```",
      ].join("\n")
    }

    return {
      content: [`✅ Screenshot(s) captured!`, "", summary, nextStep].join("\n"),
      success: true,
      captures: results,
      beforeUrl: captureState.beforeUrl,
      afterUrl: captureState.afterUrl,
    }
  },
})

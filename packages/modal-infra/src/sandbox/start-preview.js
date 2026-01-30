/**
 * Smart Start Preview Tool for Open-Inspect.
 *
 * This tool automatically:
 * 1. Auto-detects the project type (Vite, Next.js, CRA, etc.)
 * 2. Installs dependencies if needed (npm/pnpm/yarn)
 * 3. Configures framework settings for external access (allowedHosts, etc.)
 * 4. Starts the dev server with appropriate flags
 * 5. Returns the live preview URL
 */
import { tool } from "@opencode-ai/plugin"
import { z } from "zod"
import { execSync, spawn } from "child_process"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

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
 * Detect the project type and package manager from the working directory.
 */
function detectProjectType(workdir) {
  const result = {
    type: "unknown",
    packageManager: "npm",
    framework: null,
    configFile: null,
    port: 5173, // Default to Vite port
    startCommand: null,
  }

  // Check for package.json
  const packageJsonPath = join(workdir, "package.json")
  if (!existsSync(packageJsonPath)) {
    return result
  }

  let packageJson
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
  } catch {
    return result
  }

  // Detect package manager
  if (existsSync(join(workdir, "pnpm-lock.yaml"))) {
    result.packageManager = "pnpm"
  } else if (existsSync(join(workdir, "yarn.lock"))) {
    result.packageManager = "yarn"
  } else if (existsSync(join(workdir, "bun.lockb"))) {
    result.packageManager = "bun"
  }

  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

  // Detect framework from dependencies and config files
  if (deps["next"]) {
    result.type = "nextjs"
    result.framework = "Next.js"
    result.port = 3000
    result.configFile = existsSync(join(workdir, "next.config.ts"))
      ? "next.config.ts"
      : existsSync(join(workdir, "next.config.mjs"))
        ? "next.config.mjs"
        : existsSync(join(workdir, "next.config.js"))
          ? "next.config.js"
          : null
    result.startCommand = "dev"
  } else if (deps["vite"]) {
    result.type = "vite"
    result.framework = "Vite"
    result.port = 5173
    result.configFile = existsSync(join(workdir, "vite.config.ts"))
      ? "vite.config.ts"
      : existsSync(join(workdir, "vite.config.mjs"))
        ? "vite.config.mjs"
        : existsSync(join(workdir, "vite.config.js"))
          ? "vite.config.js"
          : null
    result.startCommand = "dev"
  } else if (deps["react-scripts"]) {
    result.type = "cra"
    result.framework = "Create React App"
    result.port = 3000
    result.startCommand = "start"
  } else if (deps["@angular/cli"]) {
    result.type = "angular"
    result.framework = "Angular"
    result.port = 4200
    result.startCommand = "start"
  } else if (deps["vue"]) {
    result.type = "vue"
    result.framework = "Vue"
    result.port = existsSync(join(workdir, "vite.config.ts")) ||
      existsSync(join(workdir, "vite.config.js"))
      ? 5173
      : 8080
    result.startCommand = "dev"
  } else if (deps["svelte"] || deps["@sveltejs/kit"]) {
    result.type = "svelte"
    result.framework = "Svelte/SvelteKit"
    result.port = 5173
    result.startCommand = "dev"
  } else if (deps["astro"]) {
    result.type = "astro"
    result.framework = "Astro"
    result.port = 4321
    result.startCommand = "dev"
  } else {
    // Check for common dev scripts
    if (packageJson.scripts?.dev) {
      result.startCommand = "dev"
    } else if (packageJson.scripts?.start) {
      result.startCommand = "start"
    }
  }

  return result
}

/**
 * Configure the framework to allow external hosts (for Modal tunnels).
 */
function configureFramework(workdir, projectType) {
  const { type, configFile, port } = projectType

  if (type === "vite" && configFile) {
    const configPath = join(workdir, configFile)
    let content = readFileSync(configPath, "utf-8")

    // Check if server config already exists
    if (content.includes("allowedHosts")) {
      // Already configured
      return { configured: true, message: "Vite already has allowedHosts configured" }
    }

    // Add server config with allowedHosts: true
    // Handle different config formats
    if (content.includes("export default defineConfig")) {
      // defineConfig format
      if (content.includes("server:")) {
        // Server block exists, add allowedHosts
        content = content.replace(
          /server:\s*\{/,
          "server: {\n    allowedHosts: true,\n    host: true,"
        )
      } else {
        // No server block, add one
        content = content.replace(
          /defineConfig\(\s*\{/,
          "defineConfig({\n  server: {\n    allowedHosts: true,\n    host: true,\n    port: " +
            port +
            ",\n  },"
        )
      }
    } else if (content.includes("export default {")) {
      // Plain object export
      if (content.includes("server:")) {
        content = content.replace(
          /server:\s*\{/,
          "server: {\n    allowedHosts: true,\n    host: true,"
        )
      } else {
        content = content.replace(
          /export default\s*\{/,
          "export default {\n  server: {\n    allowedHosts: true,\n    host: true,\n    port: " +
            port +
            ",\n  },"
        )
      }
    }

    writeFileSync(configPath, content)
    return { configured: true, message: `Updated ${configFile} with allowedHosts: true` }
  }

  if (type === "nextjs") {
    // Next.js doesn't need allowedHosts configuration for dev server
    return { configured: true, message: "Next.js requires no additional configuration" }
  }

  if (type === "cra") {
    // CRA uses HOST=0.0.0.0 and DANGEROUSLY_DISABLE_HOST_CHECK=true
    return {
      configured: true,
      message: "CRA will use HOST=0.0.0.0",
      env: { HOST: "0.0.0.0", DANGEROUSLY_DISABLE_HOST_CHECK: "true" },
    }
  }

  return { configured: false, message: "No framework-specific configuration needed" }
}

/**
 * Install dependencies using the detected package manager.
 */
function installDependencies(workdir, packageManager) {
  const nodeModulesPath = join(workdir, "node_modules")
  if (existsSync(nodeModulesPath)) {
    return { installed: false, message: "Dependencies already installed (node_modules exists)" }
  }

  const installCommands = {
    npm: "npm install",
    pnpm: "pnpm install",
    yarn: "yarn install",
    bun: "bun install",
  }

  const command = installCommands[packageManager] || "npm install"

  try {
    execSync(command, {
      cwd: workdir,
      stdio: "pipe",
      timeout: 120000, // 2 minute timeout
    })
    return { installed: true, message: `Dependencies installed with ${packageManager}` }
  } catch (error) {
    return {
      installed: false,
      message: `Failed to install dependencies: ${error.message}`,
      error: true,
    }
  }
}

/**
 * Start the dev server in the background.
 */
function startDevServer(workdir, projectType, extraEnv = {}) {
  const { packageManager, port, startCommand, type } = projectType

  if (!startCommand) {
    return { started: false, message: "No start command detected in package.json" }
  }

  // Build the command with appropriate flags
  let args = []
  const runCmd = packageManager === "npm" ? "npm" : packageManager

  if (packageManager === "npm") {
    args = ["run", startCommand, "--"]
  } else {
    args = [startCommand]
  }

  // Add host flag for external access
  if (type === "vite" || type === "svelte" || type === "astro") {
    args.push("--host")
  } else if (type === "nextjs") {
    args.push("-H", "0.0.0.0")
  }

  // Add port if not default
  if (type === "vite" || type === "svelte") {
    args.push("--port", String(port))
  } else if (type === "nextjs") {
    args.push("-p", String(port))
  }

  const env = {
    ...process.env,
    ...extraEnv,
    PORT: String(port), // For frameworks that use PORT env var
  }

  try {
    // Start dev server in detached mode
    const child = spawn(runCmd, args, {
      cwd: workdir,
      env,
      detached: true,
      stdio: "ignore",
    })
    child.unref()

    return {
      started: true,
      message: `Dev server started: ${runCmd} ${args.join(" ")}`,
      port,
      pid: child.pid,
    }
  } catch (error) {
    return { started: false, message: `Failed to start dev server: ${error.message}` }
  }
}

/**
 * Wait for the dev server to be ready by polling the port.
 */
async function waitForServer(port, maxWaitMs = 30000) {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      })
      // Any response means server is up
      return { ready: true, message: `Server is ready on port ${port}` }
    } catch {
      // Server not ready yet, wait and retry
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return { ready: false, message: `Server did not become ready within ${maxWaitMs / 1000}s` }
}

/**
 * Get the preview URL from the control plane.
 * @param {string} sessionId - Session ID
 * @param {number} [port] - Optional specific port to get URL for
 */
async function getPreviewUrl(sessionId, port) {
  try {
    const urlParams = port ? `?port=${port}` : ""
    const response = await fetch(`${BRIDGE_URL}/sessions/${sessionId}/preview-url${urlParams}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${BRIDGE_TOKEN}` },
    })

    if (!response.ok) {
      const errText = await response.text()
      return { url: null, availablePorts: [], error: `Failed to get preview URL: ${errText}` }
    }

    const result = await response.json()
    return {
      url: result?.url,
      availablePorts: result?.availablePorts || [],
      error: null,
    }
  } catch (e) {
    return { url: null, availablePorts: [], error: `Failed to get preview URL: ${e.message}` }
  }
}

export default tool({
  name: "start-preview",
  description: `Smart preview tool that automatically:
1. Detects your project type (Vite, Next.js, CRA, Angular, Vue, Svelte, Astro)
2. Installs dependencies if needed (npm/pnpm/yarn/bun)
3. Configures the framework for external access (allowedHosts, etc.)
4. Starts the dev server with the correct flags
5. Returns the live preview URL

Just call this tool and it handles everything - no need to manually configure anything.`,
  args: {
    skipInstall: z
      .boolean()
      .optional()
      .describe("Skip dependency installation (default: false)"),
    skipConfig: z
      .boolean()
      .optional()
      .describe("Skip framework configuration (default: false)"),
    workdir: z
      .string()
      .optional()
      .describe("Working directory (default: current directory)"),
  },
  async execute({ skipInstall = false, skipConfig = false, workdir }) {
    const sessionId = getSessionId()
    if (!sessionId) {
      return {
        content: "Failed to start preview: Session ID not found in environment.",
        success: false,
      }
    }

    // Determine working directory
    const cwd = workdir || process.cwd()
    const steps = []

    // Step 1: Detect project type
    const projectType = detectProjectType(cwd)
    steps.push({
      step: "detect",
      result: projectType.framework
        ? `Detected ${projectType.framework} project using ${projectType.packageManager}`
        : `Unknown project type (using ${projectType.packageManager})`,
    })

    if (!projectType.startCommand) {
      return {
        content: `Could not detect how to start this project. No 'dev' or 'start' script found in package.json.\n\nDetected: ${JSON.stringify(projectType, null, 2)}`,
        success: false,
      }
    }

    // Step 2: Install dependencies
    if (!skipInstall) {
      const installResult = installDependencies(cwd, projectType.packageManager)
      steps.push({ step: "install", result: installResult.message })
      if (installResult.error) {
        return {
          content: `Failed during dependency installation:\n${steps.map((s) => `- ${s.step}: ${s.result}`).join("\n")}`,
          success: false,
        }
      }
    } else {
      steps.push({ step: "install", result: "Skipped (skipInstall=true)" })
    }

    // Step 3: Configure framework
    let extraEnv = {}
    if (!skipConfig) {
      const configResult = configureFramework(cwd, projectType)
      steps.push({ step: "configure", result: configResult.message })
      if (configResult.env) {
        extraEnv = configResult.env
      }
    } else {
      steps.push({ step: "configure", result: "Skipped (skipConfig=true)" })
    }

    // Step 4: Start dev server
    const startResult = startDevServer(cwd, projectType, extraEnv)
    steps.push({ step: "start", result: startResult.message })
    if (!startResult.started) {
      return {
        content: `Failed to start dev server:\n${steps.map((s) => `- ${s.step}: ${s.result}`).join("\n")}`,
        success: false,
      }
    }

    // Step 5: Wait for server to be ready
    const readyResult = await waitForServer(projectType.port)
    steps.push({ step: "ready", result: readyResult.message })

    // Step 6: Get preview URL for the specific port
    const { url: previewUrl, availablePorts, error: urlError } = await getPreviewUrl(
      sessionId,
      projectType.port
    )
    if (urlError) {
      steps.push({ step: "preview-url", result: urlError })
    } else {
      const portInfo = availablePorts.length > 0 ? ` (available ports: ${availablePorts.join(", ")})` : ""
      steps.push({ step: "preview-url", result: (previewUrl || "No URL available") + portInfo })
    }

    // Build summary
    const summary = [
      `✅ Preview started successfully!`,
      ``,
      `**Framework:** ${projectType.framework || "Unknown"}`,
      `**Port:** ${projectType.port}`,
      `**Local URL:** http://localhost:${projectType.port}`,
      previewUrl ? `**Live Preview URL:** ${previewUrl}` : "",
      ``,
      `**Steps completed:**`,
      ...steps.map((s) => `- ${s.step}: ${s.result}`),
    ]
      .filter(Boolean)
      .join("\n")

    return {
      content: summary,
      success: true,
      previewUrl,
      port: projectType.port,
      framework: projectType.framework,
    }
  },
})

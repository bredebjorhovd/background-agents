/**
 * CORS allowlist and helpers.
 */

import type { Env } from "../types";

const DEFAULT_ALLOWED_ORIGINS: Array<string | RegExp> = [
  "https://open-inspect.vercel.app",
  /^https:\/\/open-inspect-.*\.vercel\.app$/,
];

const DEV_ORIGINS = ["http://localhost:5173"];

function normalizeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isDevDeployment(name: string | undefined): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return normalized === "development" || normalized === "dev" || normalized === "local";
}

function getAllowedOrigins(env: Env): Array<string | RegExp> {
  const origins: Array<string | RegExp> = [...DEFAULT_ALLOWED_ORIGINS];

  if (env.WEB_APP_URL) {
    const origin = normalizeOrigin(env.WEB_APP_URL);
    if (origin) origins.push(origin);
  }

  if (isDevDeployment(env.DEPLOYMENT_NAME)) {
    origins.push(...DEV_ORIGINS);
  }

  return origins;
}

function matchesOrigin(origin: string, allowed: Array<string | RegExp>): boolean {
  return allowed.some((pattern) =>
    typeof pattern === "string" ? pattern === origin : pattern.test(origin)
  );
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", value);
    return;
  }
  const values = existing.split(",").map((entry) => entry.trim());
  if (!values.includes(value)) {
    headers.set("Vary", `${existing}, ${value}`);
  }
}

export function getCorsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = getAllowedOrigins(env);
  return matchesOrigin(origin, allowed) ? origin : null;
}

export function applyCorsHeaders(response: Response, origin: string | null): Response {
  if (!origin) return response;

  const corsResponse = new Response(response.body, response);
  corsResponse.headers.set("Access-Control-Allow-Origin", origin);
  corsResponse.headers.set("Access-Control-Allow-Credentials", "true");
  corsResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  corsResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  corsResponse.headers.set("Access-Control-Max-Age", "86400");
  appendVary(corsResponse.headers, "Origin");

  return corsResponse;
}

/**
 * Test fixtures for environment bindings.
 */

import type { Env } from "../../types";

/**
 * Create a minimal Env object for testing with required secrets.
 */
export function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    SESSION: {} as DurableObjectNamespace,
    SESSION_INDEX: {} as KVNamespace,
    GITHUB_CLIENT_ID: "test-client-id",
    GITHUB_CLIENT_SECRET: "test-client-secret",
    TOKEN_ENCRYPTION_KEY: "0".repeat(64), // 32 bytes hex
    ENCRYPTION_KEY: "0".repeat(64), // 32 bytes hex
    DEPLOYMENT_NAME: "test",
    MODAL_API_SECRET: "test-modal-secret",
    INTERNAL_CALLBACK_SECRET: "test-internal-secret",
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
-----END PRIVATE KEY-----`,
    GITHUB_APP_INSTALLATION_ID: "67890",
    WORKER_URL: "https://test.workers.dev",
    WEB_APP_URL: "https://test.example.com",
    MODAL_WORKSPACE: "test-workspace",
    SANDBOX_INACTIVITY_TIMEOUT_MS: "600000",
    ...overrides,
  } as Env;
}

/**
 * Create an Env object without GitHub App credentials.
 */
export function createEnvWithoutGitHubApp(): Env {
  const env = createTestEnv();
  return {
    ...env,
    GITHUB_APP_ID: undefined,
    GITHUB_APP_PRIVATE_KEY: undefined,
    GITHUB_APP_INSTALLATION_ID: undefined,
  } as Env;
}

/**
 * Create an Env object without Linear credentials.
 */
export function createEnvWithoutLinear(): Env {
  const env = createTestEnv();
  return {
    ...env,
    LINEAR_API_KEY: undefined,
  } as Env;
}

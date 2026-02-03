import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        main: "src/index.ts",
        miniflare: {
          compatibilityDate: "2024-01-01",
          compatibilityFlags: ["nodejs_compat"],
          modules: true,
          scriptPath: "src/index.ts",
          kvNamespaces: ["SESSION_INDEX"],
          durableObjects: {
            SESSION: {
              className: "SessionDO",
              useSQLite: true,
            },
          },
          bindings: {
            GITHUB_CLIENT_ID: "test-client-id",
            GITHUB_CLIENT_SECRET: "test-client-secret",
            TOKEN_ENCRYPTION_KEY: "0".repeat(64),
            ENCRYPTION_KEY: "0".repeat(64),
            DEPLOYMENT_NAME: "test",
            MODAL_API_SECRET: "test-modal-secret",
            MODAL_WORKSPACE: "test-workspace",
            INTERNAL_CALLBACK_SECRET: "test-internal-secret",
            WORKER_URL: "https://test.workers.dev",
            WEB_APP_URL: "https://test.example.com",
            GITHUB_APP_ID: "12345",
            GITHUB_APP_PRIVATE_KEY: "test-private-key",
            GITHUB_APP_INSTALLATION_ID: "67890",
            SANDBOX_INACTIVITY_TIMEOUT_MS: "600000",
          },
        },
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.integration.test.ts", "src/test/**", "src/**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});

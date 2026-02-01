# Multi-Tenant Architecture Plan

**Goal:** Convert Open-Inspect from a single-tenant system (shared credentials) to a secure
multi-tenant system where users can only access repositories they are authorized for via GitHub.

## 1. Architecture Overview

### Current State (Single-Tenant)

- **Global Config:** Relies on a single `GITHUB_APP_INSTALLATION_ID` environment variable.
- **Access:** Any user with access to the UI can access _all_ repositories the GitHub App is
  installed on.
- **Git Operations:** Sandboxes use a broad installation token that has access to all App-installed
  repositories.

### Target State (Multi-Tenant)

- **Dynamic Discovery:** The system dynamically discovers which GitHub App installations the
  logged-in user has access to.
- **Strict Scoping (User Context):**
  - **Repo Listing:** Repository lists are fetched using the **User's OAuth Token** (via
    `GET /user/installations/{id}/repositories`). This ensures users only see repositories they
    personally have access to, preventing leaks of restricted repos within an organization that the
    App might technically have access to.
- **Strict Scoping (App Context):**
  - **Sandboxes** receive a "scoped" GitHub token valid _only_ for the specific repository they are
    working on, preventing cross-repo data leaks even if the agent tries to access others.
- **Database:** Session records include the `installationId` to enforce boundaries.

---

## 2. Component Changes

### A. Shared Types (`packages/shared`)

We need to propagate the `installationId` context across the stack.

- **`CreateSessionRequest`**: Add `installationId: string`.
- **`SessionState` / `SessionResponse`**: Add `installationId: string`.
- **`EnrichedRepository`**: Ensure it carries `installationId` so the UI knows which installation a
  repo belongs to.

### B. Control Plane (`packages/control-plane`)

#### 1. Authorization & Discovery (`src/auth/github-app.ts` / `src/auth/github.ts`)

- **New Method:** `listUserInstallations(userAccessToken: string)`
  - Calls GitHub API `GET /user/installations` using the user's OAuth token.
  - Returns list of installations accessible to the user.
- **New Method:** `listUserRepositories(userAccessToken: string, installationId: string)`
  - **CRITICAL SECURITY:** Must use `GET /user/installations/{installation_id}/repositories`.
  - Do **NOT** use `GET /installation/repositories` (which uses the App Token), as that lists _all_
    repos the App can access, potentially leaking private/admin repos to unauthorized users in the
    same org.
- **Refactor:** `listInstallationRepositories` (App Token) remains only for backend/system usage
  where User context is unavailable.

#### 2. Router Logic (`src/router.ts`)

- **`handleListRepos`**:
  - **Remove:** Global KV caching of the repo list (since lists are now per-user).
  - **Logic:**
    1. Extract user's OAuth token from request headers.
    2. Call `listUserInstallations` to get accessible installations.
    3. For each installation, call `listUserRepositories`.
    4. Aggregate and return the distinct list of repos the user can access.
- **`handleCreateSession`**:
  - **Input:** Accept `installationId` in the body.
  - **Validation:** Verify the user (via their OAuth token) actually has access to this
    `installationId` and repository before creating the session.
  - **Storage:** Persist `installationId` in the Durable Object state via SQL migration.

### C. Web Client (`packages/web`)

#### 1. Repository Listing (`app/api/repos/route.ts`)

- Pass the logged-in user's GitHub Access Token to the Control Plane (e.g., via `X-GitHub-Token` or
  `Authorization` header).
- This allows the Control Plane to perform the "on-behalf-of" lookup.

#### 2. Session Creation

- When a user selects a repository, include its `installationId` in the `POST /sessions` payload.

### D. Modal Infrastructure (`packages/modal-infra`)

This is the most critical security boundary.

#### 1. GitHub Auth (`src/auth/github_app.py`)

- **Update `generate_installation_token`**:
  - Accept an optional `repositories` argument (list of repo names).
  - When calling GitHub's `POST /app/installations/{id}/access_tokens`, pass
    `repositories=[repo_name]`.
  - **Result:** The generated token is valid _only_ for that specific repository.

#### 2. Web API (`src/web_api.py`)

- **Update `api_create_sandbox`**:
  - Accept `installation_id` in the request body.
  - Call `generate_installation_token` with:
    - `installation_id` (from request)
    - `repositories=[repo_name]` (from request)
  - Pass this **scoped token** to the sandbox environment.

---

## 3. Implementation Plan

### Phase 1: Shared Definitions

1. Update `packages/shared/src/types.ts` with new fields (`installationId`).
2. Create SQL migration in `packages/control-plane/src/session/schema.ts` to add `installation_id`
   to `session` table.

### Phase 2: Control Plane Logic

1. Implement `listUserInstallations` and `listUserRepositories` in
   `packages/control-plane/src/auth/github.ts` (using User Token).
2. Refactor `handleListRepos` in `router.ts` to use dynamic discovery via User Token.
3. Update `handleCreateSession` to store `installationId`.

### Phase 3: Web Frontend

1. Update API route to pass user credentials.
2. Update UI to handle repo selection with installation context.

### Phase 4: Modal Security Hardening

1. Update Python auth logic to support scoped tokens.
2. Enforce `installation_id` requirement in sandbox creation.

### Phase 5: Cleanup

1. Remove `GITHUB_APP_INSTALLATION_ID` from `terraform.tfvars` and environment variables (except
   perhaps as a fallback for background tasks).

---

## 4. Security Verification

After implementation, verify:

1. **Isolation:** Login as User A. Ensure you cannot see repos that belong to User B's organization
   (unless User A is also a member).
2. **Token Scope:** inside a running sandbox, try to `git clone` a _different_ repository in the
   same organization. This **MUST fail** with a permission error.
3. **Database:** Verify `installationId` is correctly stored in the SQLite `session` table.

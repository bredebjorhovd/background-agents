# Terraform Infrastructure

This directory contains Infrastructure as Code (IaC) for deploying the Open-Inspect system using
Terraform.

## Architecture Overview

The infrastructure spans three cloud providers:

| Provider       | Resources                                            | Terraform Support                |
| -------------- | ---------------------------------------------------- | -------------------------------- |
| **Cloudflare** | Workers, KV Namespaces, Durable Objects, D1 Database | Native provider                  |
| **Vercel**     | Next.js Web App                                      | Native provider                  |
| **Modal**      | Sandbox Infrastructure                               | CLI wrapper (no provider exists) |

## Directory Structure

```
terraform/
├── d1/
│   └── migrations/              # D1 database migrations (applied via d1-migrate.sh)
├── modules/                      # Reusable Terraform modules
│   ├── cloudflare-kv/           # KV namespace management
│   ├── cloudflare-worker/       # Worker deployment with bindings (KV, DO, D1)
│   ├── vercel-project/          # Vercel project + environment vars
│   └── modal-app/               # Modal CLI wrapper
│       └── scripts/             # Deployment scripts
├── environments/
│   └── production/              # Production environment config
│       ├── main.tf              # Main configuration
│       ├── variables.tf         # Input variables
│       ├── outputs.tf           # Output values
│       ├── backend.tf           # State backend (R2)
│       ├── versions.tf          # Provider versions
│       └── terraform.tfvars.example
└── README.md                    # This file
```

## Prerequisites

### 1. Required Tools

```bash
# Terraform >= 1.5.0
brew install terraform

# Modal CLI (for Modal deployments)
pip install modal

# Node.js >= 22 (for building workers)
brew install node@22
```

### 2. Cloudflare Setup

1. **Create API Token** at [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Permissions needed: Workers Scripts (Edit), Workers KV (Edit), Workers Routes (Edit), D1 (Edit)

2. **Create R2 Bucket** for Terraform state:
   - Bucket name: `open-inspect-terraform-state`
   - Generate R2 API token with read/write permissions

3. **Note your Account ID** (found in dashboard URL)

### 3. Vercel Setup

1. **Create API Token** at [Vercel Account Settings](https://vercel.com/account/tokens)
2. **Note your Team ID** (found in team settings URL)

### 4. Modal Setup

1. **Sign up** at [Modal](https://modal.com)
2. **Create API Token** at Modal Settings

### 5. GitHub Apps

1. **OAuth App** - For user authentication
   - Create at: https://github.com/settings/developers
   - Callback URL: `https://<your-vercel-app>.vercel.app/api/auth/callback/github`

2. **GitHub App** - For repository access in sandboxes
   - Create at: https://github.com/settings/apps
   - Convert private key to PKCS#8 format:
     ```bash
     openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem -out key-pkcs8.pem
     ```

### 6. Slack App

Create at [Slack API](https://api.slack.com/apps) and note:

- Bot OAuth Token (`xoxb-...`)
- Signing Secret

## Quick Start

### 1. Configure Variables

```bash
cd terraform/environments/production

# Copy example files and fill in values
cp terraform.tfvars.example terraform.tfvars
cp backend.tfvars.example backend.tfvars

# Edit with your values
vim terraform.tfvars
vim backend.tfvars
```

### 2. Initialize Terraform

```bash
# Initialize with R2 backend config file
terraform init -backend-config=backend.tfvars

# Or pass values directly:
terraform init \
  -backend-config="access_key=YOUR_R2_ACCESS_KEY_ID" \
  -backend-config="secret_key=YOUR_R2_SECRET_ACCESS_KEY" \
  -backend-config='endpoints={s3="https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"}'
```

### 3. Plan Changes

```bash
terraform plan
```

### 4. Apply Changes

```bash
terraform apply
```

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/terraform.yml`) automates:

| Trigger       | Action                           |
| ------------- | -------------------------------- |
| Pull Request  | `terraform plan` with PR comment |
| Merge to main | `terraform apply` (auto-approve) |

### Required GitHub Secrets

Add these secrets to your repository settings:

```
# Deployment
DEPLOYMENT_NAME          # Unique name for your deployment (e.g., 'acme', 'johndoe')

# Cloudflare
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY

# Vercel
VERCEL_API_TOKEN
VERCEL_TEAM_ID

# Modal
MODAL_TOKEN_ID
MODAL_TOKEN_SECRET

# GitHub OAuth App
GH_OAUTH_CLIENT_ID
GH_OAUTH_CLIENT_SECRET

# GitHub App
GH_APP_ID
GH_APP_PRIVATE_KEY
GH_APP_INSTALLATION_ID

# Slack
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET

# API Keys
ANTHROPIC_API_KEY

# Security Secrets
TOKEN_ENCRYPTION_KEY
REPO_SECRETS_ENCRYPTION_KEY
INTERNAL_CALLBACK_SECRET
NEXTAUTH_SECRET
```

## Module Reference

### cloudflare-kv

Creates a Cloudflare Workers KV namespace.

```hcl
module "my_kv" {
  source = "../../modules/cloudflare-kv"

  account_id     = var.cloudflare_account_id
  namespace_name = "my-namespace"
}
```

**Outputs:** `namespace_id`, `namespace_name`

### cloudflare-worker

Deploys a Cloudflare Worker with bindings using the native 3-resource pattern: `cloudflare_worker` +
`cloudflare_worker_version` + `cloudflare_workers_deployment`

```hcl
module "my_worker" {
  source = "../../modules/cloudflare-worker"

  account_id  = var.cloudflare_account_id
  worker_name = "my-worker"
  script_path = "dist/index.js"  # Path to bundled JS file

  kv_namespaces = [
    { binding_name = "KV", namespace_id = module.my_kv.namespace_id }
  ]

  service_bindings = [
    { binding_name = "OTHER_WORKER", service_name = "other-worker" }
  ]

  secrets = [
    { name = "API_KEY", value = var.api_key }
  ]

  durable_objects = [
    { binding_name = "DO", class_name = "MyDurableObject" }
  ]

  d1_databases = [
    { binding_name = "DB", database_id = cloudflare_d1_database.main.id }
  ]

  compatibility_date = "2024-09-23"
  migration_tag      = "v1"  # For DO migrations
}
```

**Outputs:** `worker_name`, `worker_id`, `version_id`, `deployment_id`, `worker_url`

### vercel-project

Creates a Vercel project with environment variables.

```hcl
module "web_app" {
  source = "../../modules/vercel-project"

  project_name = "my-app"
  team_id      = var.vercel_team_id
  framework    = "nextjs"

  git_repository = {
    type = "github"
    repo = "owner/repo"
  }

  root_directory = "packages/web"

  environment_variables = [
    {
      key       = "API_URL"
      value     = "https://api.example.com"
      targets   = ["production", "preview"]
      sensitive = false
    }
  ]
}
```

**Outputs:** `project_id`, `project_name`, `production_url`

### modal-app

Deploys a Modal app via CLI wrapper.

```hcl
module "modal" {
  source = "../../modules/modal-app"

  modal_token_id     = var.modal_token_id
  modal_token_secret = var.modal_token_secret

  app_name      = "my-app"
  deploy_path   = "${path.root}/../../../packages/modal-infra"
  deploy_module = "deploy"

  volume_name = "my-volume"

  secrets = [
    {
      name = "my-secret"
      values = {
        KEY1 = "value1"
        KEY2 = "value2"
      }
    }
  ]
}
```

**Outputs:** `app_name`, `deploy_id`, `api_health_url`

## Important Notes

### Durable Objects

Durable Object migrations are applied with deployments. This means you can't bind to a Durable
Object in a Version if a deployment doesn't exist (i.e., migrations haven't been applied).

**First-time deployment with Durable Objects:**

The first `terraform apply` may fail due to the chicken-and-egg problem. Workaround:

1. Comment out the `durable_objects` binding block in the module
2. Run `terraform apply` to create the worker and deployment
3. Uncomment the `durable_objects` binding
4. Comment out the `migrations` block
5. Run `terraform apply` again

See
[Cloudflare's documentation](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/)
for details.

### State Management

- State is stored in Cloudflare R2 (S3-compatible)
- Use state locking in production (consider DynamoDB or similar)
- Never commit `terraform.tfvars` or state files

### Modal Limitations

Since Modal has no Terraform provider, the module uses `null_resource` with `local-exec`:

- Changes are detected via source file hashing
- Manual intervention may be needed for complex updates

## Verification

After deployment, verify with:

```bash
# Get verification commands from Terraform output
terraform output verification_commands

# Or manually:

# 1. Health check control plane
curl https://open-inspect-control-plane-prod.<subdomain>.workers.dev/health

# 2. Health check Modal (replace <workspace> with your Modal workspace)
curl https://<workspace>--open-inspect-api-health.modal.run

# 3. Verify Vercel deployment (replace with your Vercel app URL)
curl https://<your-vercel-app>.vercel.app

# 4. Test authenticated endpoint (should return 401)
curl https://open-inspect-control-plane-prod.<subdomain>.workers.dev/sessions
```

## Troubleshooting

### "Backend initialization required"

```bash
terraform init \
  -backend-config="access_key=$R2_ACCESS_KEY_ID" \
  -backend-config="secret_key=$R2_SECRET_ACCESS_KEY"
```

### "Provider configuration not present"

Ensure all required variables are set either in `terraform.tfvars` or as `TF_VAR_*` environment
variables.

### Modal deployment fails

1. Check Modal CLI is installed: `modal --version`
2. Verify Modal credentials: `modal token show`
3. Check logs: `modal app logs open-inspect`

### Worker deployment fails

1. Build workers first: `npm run build -w @open-inspect/control-plane`
2. Check script exists: `ls packages/control-plane/dist/index.js`
3. Verify API token permissions

## Testing changes safely and rolling back

### 1. Plan first (no changes)

Always run a plan before apply. Nothing is modified.

```bash
cd terraform/environments/production
terraform plan
```

Review the plan: new resources (e.g. R2 bucket, worker version with new binding) and any in-place
updates. If anything looks wrong, do not apply.

### 2. Optional: use a staging environment

To test screenshots/preview (or any change) without touching production:

1. Copy the production environment and use a different `deployment_name`:

   ```bash
   cp -r environments/production environments/staging
   ```

2. In `staging/backend.tf`, set a different state key, e.g. `key = "staging/terraform.tfstate"`.
3. In `staging/terraform.tfvars`, set `deployment_name = "staging"` (and any staging-specific vars).
4. Run `terraform init -backend-config=...` and `terraform apply` in `staging/`.

You get separate resources (`open-inspect-control-plane-staging`, `open-inspect-artifacts-staging`,
etc.). Test there; if it works, apply the same code to production. If not, fix and re-apply to
staging, or destroy staging: `terraform destroy` in `staging/`.

### 3. Tag before apply (easy rollback point)

Before applying to production, create a tag so you can revert code and redeploy to this state:

```bash
git tag pre-screenshots-preview   # or any name
# then terraform apply, deploy control plane / Modal / web
```

To roll back later: `git checkout pre-screenshots-preview` (or revert the commits), then re-run your
deploy steps (Terraform apply, worker deploy, Modal deploy, Vercel deploy).

### 4. What happens if you roll back

- **Roll back only Terraform** (remove the new R2 module and worker R2 binding, then
  `terraform apply`):  
  The new control plane code stays deployed, but the Worker no longer has an R2 binding. Screenshot
  upload returns 503 “R2 not configured”. Rest of the app (sessions, PRs, etc.) keeps working.
  Preview tunnel URL may still be set if Modal returns it; “View preview” can work if the artifact
  was already created.

- **Roll back everything** (revert Terraform + control plane + Modal + web code, then
  `terraform apply` and redeploy):  
  You return to the previous behaviour. R2 bucket can be removed by Terraform if you reverted the R2
  module (Terraform will drop the bucket and the binding). **Note:** Destroying the R2 bucket
  deletes all objects in it (e.g. any screenshots already stored).

- **Roll back only app code** (revert control plane / Modal / web, keep Terraform as-is):  
  Worker and Modal run the old code; the new R2 bucket and binding stay but are unused until you
  deploy the new code again.

### 5. Risk level of this change

- **Terraform:** Additive only (new R2 bucket, new binding on existing worker). No renames or
  removals of existing resources.
- **Control plane:** New routes and optional R2 usage; if `R2_ARTIFACTS` is missing, screenshot
  upload returns 503 and the rest of the API is unchanged.
- **Modal:** `encrypted_ports=[5173]` added to sandbox create; if tunnel URL fails we store `null`
  and continue, so sandbox creation does not fail.

So a single `terraform apply` plus your normal deploys is low-risk; having a tag and a plan to
revert (Terraform + app) is enough for a non-destructive test.

## Troubleshooting

### "Provider produced inconsistent final plan" on `cloudflare_worker_version`

If `terraform apply` fails with:

```text
Error: Provider produced inconsistent final plan
When expanding the plan for module.control_plane_worker.cloudflare_worker_version.this ...
planned set element ... does not correlate with any element in actual.
```

this is a known Cloudflare provider bug when comparing the worker version’s `modules` set.
Workaround: taint the worker version so the next apply recreates it, then apply again:

```bash
cd terraform/environments/production
terraform taint 'module.control_plane_worker.cloudflare_worker_version.this'
terraform apply
```

The worker will be redeployed with the same script; only the version resource is recreated.

## Adding New Environments

To add a staging environment:

```bash
# Copy production config
cp -r environments/production environments/staging

# Update backend key in staging/backend.tf
# key = "staging/terraform.tfstate"

# Update environment variable in staging/terraform.tfvars
# environment = "staging"

# Initialize and apply
cd environments/staging
terraform init -backend-config="access_key=..." -backend-config="secret_key=..."
terraform apply
```

## Security Considerations

- All sensitive variables are marked with `sensitive = true`
- Never commit `terraform.tfvars` files
- Use GitHub Secrets for CI/CD
- Rotate secrets regularly
- Review plan output before applying

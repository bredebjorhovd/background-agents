# Architectural Review: Open-Inspect Background Agent System

## Executive Summary

Open-Inspect is a **well-architected** background coding agent system with a clear separation of concerns. The multi-cloud approach (Cloudflare + Modal + Vercel) is unconventional but pragmatic—each provider is chosen for its strengths. There are some scalability concerns and missing pieces worth addressing.

---

## 1. Component Architecture Assessment

### Current Components

```
┌─────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐
│    Web      │────▶│       Control Plane             │────▶│   Modal     │
│  (Vercel)   │     │   (Cloudflare Workers + DO)     │     │  (Sandbox)  │
└─────────────┘     └─────────────────────────────────┘     └─────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
               ┌────────┐    ┌─────────┐    ┌─────────┐
               │   KV   │    │   R2    │    │ GitHub  │
               │ (Index)│    │(Artifacts)│   │  App    │
               └────────┘    └─────────┘    └─────────┘
```

### What Works Well

| Component | Strength |
|-----------|----------|
| **Durable Objects** | Perfect for session state—strong consistency, WebSocket hibernation, embedded SQLite |
| **Modal** | Excellent for sandboxes—fast cold starts, filesystem snapshots, serverless scaling |
| **Separation of Control/Data Plane** | Clean boundary—control plane doesn't run user code |
| **HMAC Authentication** | Secure service-to-service auth with time-limited tokens |
| **Infrastructure as Code** | Everything in Terraform—reproducible, auditable |

### Architectural Concerns

| Issue | Impact | Severity |
|-------|--------|----------|
| Single Durable Object per session | Memory pressure with many events | Medium |
| No message queue | Tight coupling between control plane and sandbox | Medium |
| Single-tenant GitHub App | Cannot scale to multiple organizations | High (for SaaS) |
| No observability infrastructure | Limited debugging and monitoring | Medium |

---

## 2. Scalability Analysis

### Current Scale Limits

| Dimension | Current Limit | Bottleneck |
|-----------|---------------|------------|
| **Sessions per deployment** | ~100K active | KV listing performance |
| **Events per session** | ~100K rows | SQLite in DO (128MB limit) |
| **Concurrent sandbox connections** | ~1000 | Modal function concurrency |
| **WebSocket connections per DO** | ~100 | DO memory/CPU limits |

### Horizontal Scaling
- **Sandboxes**: Modal auto-scales—each sandbox is independent
- **Sessions**: Each Durable Object is isolated—sessions scale horizontally
- **Web tier**: Vercel auto-scales

### Vertical Scaling Concerns
- **Long-running sessions** accumulate events → SQLite size grows
- **Active sessions** with many participants could hit DO memory limits
- **Event streaming** to many clients could overload single DO

### Recommendations

1. **Event pagination/archival**: Archive old events to R2, keep recent in SQLite
2. **Event compaction**: Summarize old tool_call events, keep metadata only
3. **Session sharding**: For very large sessions, consider multiple DOs per session

---

## 3. Tech Stack Analysis

### Current Stack

| Layer | Technology | Assessment |
|-------|------------|------------|
| **Frontend** | Next.js 15 + React 19 | Modern, good DX |
| **API Gateway** | Cloudflare Workers | Low latency, edge-native |
| **Session State** | Durable Objects + SQLite | Perfect fit |
| **Sandbox Runtime** | Modal + Python | Best serverless container platform |
| **AI Agent** | OpenCode (Claude) | Good choice |
| **IaC** | Terraform | Multi-cloud, mature |

### Technology Choices Deep Dive

#### Cloudflare Workers (Control Plane) — KEEP
**Pros**:
- Durable Objects provide stateful sessions without external database
- WebSocket hibernation reduces costs
- Edge deployment = low latency globally
- SQLite is surprisingly capable for session data

**Cons**:
- 128MB memory limit per DO
- No native Terraform provider for Modal (workaround works)
- Cold start on hibernation recovery

**Verdict**: Excellent choice. The DO + SQLite pattern is well-suited for session management.

#### Modal (Sandbox) — KEEP
**Pros**:
- Fast container cold starts (~500ms)
- Native filesystem snapshots for session resume
- Python ecosystem for AI/ML tooling
- Serverless billing = pay per execution

**Cons**:
- Vendor lock-in for snapshot feature
- Limited debugging tools
- No Terraform provider

**Verdict**: Best-in-class for this use case. The snapshot feature alone justifies the choice.

#### Vercel (Web) — KEEP
**Pros**:
- Native Next.js support
- Preview deployments for PRs
- Edge middleware support
- Good integration with Cloudflare (for proxying)

**Cons**:
- Expensive at scale
- Limited compute for API routes

**Verdict**: Good for web tier. Keep the backend on Cloudflare Workers.

### Alternative Considerations

| Component | Alternative | Why NOT |
|-----------|-------------|---------|
| Control Plane | AWS Lambda + DynamoDB | Higher latency, more complex WebSocket handling |
| Control Plane | Fly.io | Good option, but DO + SQLite is more elegant |
| Sandbox | AWS ECS/Fargate | Slower cold starts, no native snapshots |
| Sandbox | Fly.io Machines | Good option, but Modal snapshots are superior |
| Web | Self-hosted Next.js | More operational burden |

---

## 4. Data Storage Review

### Current Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Session Storage                          │
│  ┌──────────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Durable Object   │  │ Cloudflare  │  │  Cloudflare   │  │
│  │ SQLite (128MB)   │  │    KV       │  │     R2        │  │
│  │ - messages       │  │ - index     │  │ - artifacts   │  │
│  │ - events         │  │ - cache     │  │ - screenshots │  │
│  │ - participants   │  │             │  │               │  │
│  │ - sandbox state  │  │             │  │               │  │
│  └──────────────────┘  └─────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Sandbox Storage                           │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │  Modal Volume    │  │      Modal Image Snapshots      │  │
│  │  (JSON files)    │  │  (Full filesystem state)        │  │
│  │  - snapshot meta │  │  - Code changes                 │  │
│  │  - repo config   │  │  - Environment state            │  │
│  └──────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Assessment

| Storage | Purpose | Issues |
|---------|---------|--------|
| **DO SQLite** | Session state | Size limit (128MB), no cross-session queries |
| **KV** | Session index | Eventually consistent, list performance degrades |
| **R2** | Artifacts | Good fit, no issues |
| **Modal Volume** | Snapshot metadata | JSON files are fragile, no transactions |
| **Modal Snapshots** | Filesystem state | Vendor lock-in, but necessary |

### Missing Storage Capabilities

1. **Cross-session analytics**: Cannot query across sessions efficiently
2. **Time-series metrics**: No observability data store
3. **Full-text search**: Cannot search across message content
4. **Vector storage**: No semantic search for cross-session memory (RFC 003)

### Recommendations

1. **Add Clickhouse or Tinybird** for analytics/observability
2. **Consider D1** (Cloudflare's SQLite) for cross-session queries
3. **Add Vectorize** (Cloudflare) or Pinecone for semantic search
4. **Move snapshot metadata to D1** for better querying

---

## 5. What's Missing

### Critical Missing Pieces

| Missing | Impact | Priority |
|---------|--------|----------|
| **Observability stack** | Can't debug production issues | HIGH |
| **Rate limiting** | Vulnerable to abuse | HIGH |
| **Cost controls** | Unbounded LLM spend | HIGH |
| **Multi-tenant support** | Can't scale to SaaS | MEDIUM (per plan) |

### Observability Gaps

Currently there's:
- Basic event logging to SQLite
- No distributed tracing
- No metrics collection
- No alerting
- No centralized logging

**Recommendation**: Add:
- **Sentry** or **Highlight.io** for error tracking
- **Axiom** or **Baselime** for Cloudflare Workers logs
- **Modal's built-in metrics** + external dashboard

### Security Gaps

- No rate limiting on API endpoints
- No per-user cost tracking
- No sandbox escape detection
- No audit logging for compliance

### Operational Gaps

- No graceful degradation strategy
- No circuit breakers between services
- No chaos testing
- Limited disaster recovery

---

## 6. Multi-Tenancy Considerations

Current design is **single-tenant** (per CLAUDE.md and docs/MULTI_TENANT_PLAN.md).

### To Support Multi-Tenancy, Need:

| Requirement | Current State | Needed |
|-------------|---------------|--------|
| GitHub App per tenant | Single installation | OAuth App or per-tenant App |
| Isolated sandboxes | Shared Modal app | Namespace isolation |
| Tenant-scoped data | Global KV keys | Prefixed keys or separate namespaces |
| Billing isolation | None | Usage metering per tenant |
| Access control | Single allowlist | RBAC per organization |

---

## 7. Recommendations Summary

### Keep (Working Well)
- Cloudflare Workers + Durable Objects for control plane
- Modal for sandbox execution
- Terraform for infrastructure
- HMAC service-to-service auth
- Next.js on Vercel for web

### Add
- **Observability**: Sentry + Axiom + custom metrics
- **Rate limiting**: Cloudflare rate limiting rules
- **Cost controls**: Token budgets per session/user
- **Analytics DB**: Clickhouse or D1 for cross-session queries
- **Event archival**: Move old events to R2

### Consider Changing
- **Snapshot metadata**: Move from Modal Volume JSON to D1
- **Session index**: Consider D1 instead of KV for complex queries
- **Vector search**: Add for cross-session memory (when implementing RFC 003)

### For Multi-Tenancy (Future)
- GitHub OAuth App instead of GitHub App
- Tenant isolation at KV/D1 level
- Per-tenant Modal namespaces
- Usage metering and billing

---

## 8. Overall Assessment

| Dimension | Grade | Notes |
|-----------|-------|-------|
| **Architecture** | A- | Clean separation, good abstractions |
| **Technology Choices** | A | Each component well-suited to purpose |
| **Scalability** | B+ | Good horizontal, some vertical limits |
| **Security** | B | Auth is solid, missing rate limiting |
| **Observability** | C | Major gap—needs attention |
| **Multi-tenancy** | D | Not designed for it (intentionally) |
| **Operational Maturity** | B- | Good IaC, missing operational tooling |

**Overall**: This is a **well-designed single-tenant system**. The multi-cloud approach is justified—each provider brings unique capabilities (DO for sessions, Modal for sandboxes). The main gaps are operational: observability, rate limiting, and cost controls need to be addressed before production deployment at scale.

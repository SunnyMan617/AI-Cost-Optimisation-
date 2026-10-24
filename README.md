# AI Cost Optimisation Gateway MVP (Demo)

This is a demo-ready MVP scaffold using your requested stack:

- LiteLLM as single gateway to OpenAI/Anthropic/Google
- TypeScript + NestJS API service
- Python privacy service (Presidio + UK detectors)
- Next.js dashboard
- PostgreSQL + Redis
- Docker Compose orchestration

## Project Structure

```text
ai-cost-optimisation-gateway-mvp/
  gateway/
    litellm_config.yaml
    hooks/
  services/
    api/          # NestJS control plane
    privacy/      # Python Presidio service
  apps/
    dashboard/    # Next.js UI
  docker-compose.yml
  .env.example
```

## MVP Features Included

- Multi-tenant records with per-tenant budget and fail-open/fail-closed policy
- PII masking before provider call, restoration after provider response
- UK detectors:
  - NI Number
  - NHS Number (Modulus 11 checksum validation)
  - UK Postcode
- Metadata-only audit log (no prompt text persisted)
- Exact + semantic cache per tenant in Redis
- Basic savings ledger in Postgres (baseline vs actual)
- Runaway Agent Guard spike protection (5-minute window)
- Batch Autopilot demo mode via `canWait=true` (discounted cost model)
- Dashboard summary endpoint + Next.js UI
- Gateway-down fallback policy:
  - fail-closed (default): return `503`
  - fail-open: optional direct masked OpenAI fallback (PII still protected)

## Quick Start (Local)

1. Copy env file:
   - `cp .env.example .env`
2. Put provider keys into `.env`:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
3. Run:
   - `docker compose up --build`
4. Create/Update tenant:
   - `POST http://localhost:3001/tenants`
   - JSON body:
     ```json
     {
       "id": "demo-tenant",
       "name": "Demo Tenant",
       "monthlyBudgetUsd": 500,
       "failClosed": true
     }
     ```
5. Test chat completion:
   - `POST http://localhost:3001/v1/chat/completions`
   - JSON body:
     ```json
     {
       "tenantId": "demo-tenant",
       "model": "openai-gpt-4o-mini",
       "canWait": false,
       "messages": [
         {
           "role": "user",
           "content": "My NHS number is 943 476 5919. Summarize this message."
         }
       ]
     }
     ```
6. Open dashboard:
   - `http://localhost:3000`

## Free Deployment Steps (Demo-Friendly)

For "free", the most practical route is a single always-free VM and Docker Compose.

### Option A (Recommended): Oracle Cloud Always Free VM

1. Create Oracle Cloud account (Always Free eligible).
2. Create Ubuntu VM (Ampere A1 or Micro, Always Free shape).
3. Open ports in Security List:
   - `80`, `443`, `3000`, `3001` (and optionally `22` for SSH).
4. SSH into VM and install Docker + Compose plugin.
5. Clone this project to VM.
6. Create `.env` from `.env.example` and fill provider keys.
7. Run:
   - `docker compose up -d --build`
8. Point your domain/subdomain to VM public IP.
9. (Optional) Add Caddy or Nginx for TLS and reverse proxy:
   - `/` -> dashboard `3000`
   - `/api` -> api `3001`

### Option B: Split Free Services

- `dashboard` on Vercel free
- `api` + `privacy` on Render free web services
- Postgres on Neon free tier
- Redis on Upstash free tier
- LiteLLM on Render/Fly free tier (cold-start risk)

This is good for demoing but less reliable than Option A because free tiers can sleep.

## Acceptance Test Checklist (MVP Demo)

- Tenant isolation: two tenants, same prompt, verify separate cache keys and ledgers
- PII: run 50+ prompts through `/v1/chat/completions`, verify masking and restore correctness
- Cache latency: repeated request should return from exact cache quickly
- Fail policy:
  - with `failClosed=true`, when LiteLLM is down expect `503`
  - with `failClosed=false`, fallback path still sends masked prompt only
- Ledger reconciliation: compare endpoint outputs with saved costs/savings rows

## Notes

- This is an MVP demo scaffold, intentionally lightweight for faster iteration.
- Before production pilot:
  - add full authn/authz
  - add full observability and tracing
  - add strict schema migrations
  - harden retries/circuit breakers
  - add full e2e test matrix for UK PII and provider failures

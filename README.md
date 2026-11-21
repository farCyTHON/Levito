# Levito

**Organizational memory and leadership handover for university student
organizations.** Levito preserves institutional knowledge across committee
transitions — using **Notion as the persistent source of truth** — and answers
the question every outgoing committee asks: *what is ready to transfer, what is
missing, and which records prove it?*

## Modules

| Module | What it does |
| --- | --- |
| **Overview** | Documented-readiness summary, org metrics, prioritized attention list with remediation links. |
| **Initiatives** | Events, campaigns, projects and recurring work — owners, dates, linked knowledge, decisions and actions. Per-initiative **handover readiness** (owner 20%, successor 20%, playbook 25%, review recency 15%, action completeness 20%) with exact missing information. |
| **Knowledge Library** | Playbooks, SOPs, lessons, contacts and templates — searchable, filterable, review-state tracked. |
| **Decision Log** | Chronological decisions with context, alternatives, rationale and outcome — including explicitly *pending* outcomes. |
| **Handover Center** | Per-role handovers with a transparent readiness checklist, evidence links, remediation steps, and deterministic **handover pack** generation written to Notion. |
| **Settings** | Members, review policy, theme — plus live Notion connection status, schema discovery, field mapping and guided repair. |

## Architecture

```text
Presentation (Next.js App Router, client components)
        ↓ fetch /api/*
Route handlers (Zod-validated, server-only)
        ↓
Application services (workspace service, commands)
        ↓
Repository interfaces (lib/repositories)
        ↓                    ↓
Notion adapter          Demo adapter
(dataSources.query,     (file-backed, clearly
 pages.*, blocks.*)     labelled demo data)
```

- Domain models and readiness rules are pure functions — no Next.js, React or
  SDK imports.
- Raw Notion responses never reach the UI; repositories return typed records
  plus `WriteReceipt`s (`target: "notion" | "demo-session"`, `confirmed`).
- Writes are only reported as successful **after** Notion confirms them.
- Server composition root (`lib/server/context.ts`) selects Notion vs demo
  from environment variables. Present-but-broken credentials surface an error
  state — never a silent fallback to demo.

## Quick start

```bash
npm install
cp .env.example .env.local   # add NOTION_API_KEY + NOTION_ROOT_PAGE_ID
npm run notion:setup         # provisions databases, writes IDs to .env.local
npm run dev                  # http://localhost:3000
```

Without `NOTION_API_KEY`, the app runs on **demo data** — fictional records for
a demo society, persisted to `.data/levito-demo.json` on the server. Every demo
screen is labelled; demo writes never claim Notion synchronization.

## Notion integration

- API version pinned via `NOTION_VERSION` (default `2026-03-11`), SDK
  `@notionhq/client`.
- Uses the current **data source API** (`dataSources.retrieve/query/update`,
  `pages.*`, `blocks.children.*`) — not deprecated `databases.query`.
- Cursor pagination until `has_more` is false; `request_status: incomplete`
  surfaces as an explicit error rather than partial data.
- Permission failures, invalid credentials, missing properties, rate limits
  (single bounded read retry honoring `Retry-After`) and validation errors are
  normalized into typed `NotionError`s.

### Provisioning

`npm run notion:setup` is **idempotent**: it creates (or reuses by title) the
Members, Initiatives, Knowledge Library, Decision Log, Handover Actions,
Handovers databases plus all relation properties under `NOTION_ROOT_PAGE_ID`,
creates the Levito Configuration page (org details + review policy stored as a
JSON code block), and upserts the resulting IDs into `.env.local`. Re-running
never duplicates resources.

### Existing workspaces & field mapping

Point the `NOTION_DS_*` variables at your own data sources. Levito discovers
actual property names/types at runtime, resolves fields by property ID first
then name, and reports per-field status (`ok`, `missing`, `type_mismatch`,
`relation_target_mismatch`). Custom overrides persist to
`notion.mapping.json` (gitignored). Settings → Data source offers a mapping
editor and a **confirmation-based repair** that only *adds* missing scalar
properties — it never modifies or deletes existing schema.

## Environment variables

See `.env.example`. All are server-side only — nothing is exposed to the
browser bundle.

| Variable | Purpose |
| --- | --- |
| `NOTION_API_KEY` | Internal integration token (`ntn_…`). |
| `NOTION_ROOT_PAGE_ID` | Parent page for provisioning and pack pages. |
| `NOTION_VERSION` | Notion API version (default `2026-03-11`). |
| `NOTION_DS_MEMBERS` … `NOTION_DS_HANDOVERS` | Six data source IDs (written by `notion:setup`). |
| `NOTION_CONFIG_PAGE_ID` | Levito Configuration page (org + review policy). |
| `LEVITO_DEMO_FILE` | Optional override for the demo data file path. |

## API

`GET /api/workspace` returns the full snapshot (`mode`, `today`, all
collections). Collection routes `/api/{members,initiatives,knowledge,decisions,
actions,handovers}` support `GET`/`POST` and `/api/<collection>/<id>`
`GET`/`PATCH`/`DELETE`. `POST /api/initiatives/[id]/pack` and
`POST /api/handovers/[id]/pack` generate packs. `GET /api/status`,
`GET /api/notion/connection`, `GET|PUT /api/notion/mapping`,
`POST /api/notion/repair`, `POST /api/demo/reset` round out the surface.

## Development

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint
npm run test       # vitest (48 tests)
npm run typecheck  # tsc --noEmit
npm run notion:setup
```

## Limitations

- **Single organization per deployment** — no multi-tenancy, auth, or billing.
- Notion connection token ≠ user authentication; deploy behind your own gateway
  for real users.
- Readiness is **documented** readiness — it cannot prove all organizational
  knowledge was recorded.
- Relation properties require their target data sources to be shared with the
  integration; permission gaps surface as explicit errors, not silent empties.
- Very large workspaces (>10k rows per data source) hit Notion's query ceiling
  and report `incomplete_results` rather than partial data.
- Demo mode persists to a local file on the server — it is a development
  convenience, not a database.

## Screenshots

_UI screenshots to be added — run `npm run dev` and capture Overview,
Initiatives, Handover Center, and Settings → Data source._

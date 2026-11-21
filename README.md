# Levito

Organizational memory and leadership handover platform for university student
organizations. Notion is the source of truth; this app reads and writes your
Notion workspace through typed repositories — never a separate database.

## Modules

Overview · Initiatives · Knowledge Library · Decision Log · Handover Center · Settings

Handover readiness is explainable: five equally weighted checks (owners,
successor, playbooks, review currency, open actions) with evidence links.
Handover packs are generated deterministically from stored records and can be
written to Notion as real pages.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 ·
shadcn/ui · Zod · @notionhq/client · Vitest

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in NOTION_API_KEY + NOTION_ROOT_PAGE_ID
npm run notion:setup         # provisions databases, writes data source IDs to .env.local
npm run dev                  # http://localhost:3000
```

Without `NOTION_API_KEY` the app runs on clearly labelled **demo data**
(persisted to `.data/levito-demo.json` on the server) — nothing is written to
Notion and the UI says so.

## Notion setup

`npm run notion:setup` is idempotent: it creates (or reuses) the Members,
Initiatives, Knowledge Library, Decision Log, Handover Actions and Handovers
databases plus relation properties under `NOTION_ROOT_PAGE_ID`, creates the
Levito Configuration page, and writes all IDs to `.env.local`. Re-running never
duplicates resources.

For existing workspaces, point the `NOTION_DS_*` variables at your own data
sources. Settings → Data source discovers actual property names/types, resolves
field mappings (property IDs preferred, names as fallback), allows custom
mapping overrides (`notion.mapping.json`), and offers confirmation-based repair
that only *adds* missing scalar properties — it never modifies existing schema.

## API

`GET /api/workspace` returns the full workspace snapshot. Collection routes
`/api/{members,initiatives,knowledge,decisions,actions,handovers}` support
GET/POST and `/api/<collection>/<id>` GET/PATCH/DELETE. `POST
/api/handovers/<id>/pack` writes a handover pack page to Notion.
`GET /api/status` and `GET /api/notion/connection` report connection and
mapping health.

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npm run test` ·
`npm run typecheck` · `npm run notion:setup`

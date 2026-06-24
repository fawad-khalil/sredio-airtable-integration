# FSD Task — Airtable Integration Dashboard

## IMPORTANT

This task must be completed exclusively — no external help of any kind is allowed.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

---

## Project Context

- **Product:** Airtable Integration Dashboard — sync Airtable data to MongoDB, scrape revision history, display via Angular + AG Grid
- **Stack:** Angular 19 + Angular Material + AG Grid 33.0 + Node.js v22 + MongoDB
- **Task Parts:** A (API sync) → B (Scraper) → C (Angular UI)

### Task Parts

| Part | Description |
|------|-------------|
| **Part A** | Airtable OAuth 2.0 + REST API sync → MongoDB (bases, tables, tickets/pages, users) with pagination |
| **Part B** | Cookie-based scraper for revision history (assignee + status changes) with MFA support; HTML parsing |
| **Part C** | Angular UI — AG Grid table with dynamic columns, search, filter/sort, integration dropdown, entity dropdown |

---

## Tech Stack

### Frontend

- **Framework:** Angular 19 (standalone components)
- **UI Library:** Angular Material
- **Icons:** Angular Material Icons
- **Grid:** AG Grid 33.0 + AG Charts
- **State:** Angular Signals / RxJS
- **HTTP:** Angular HttpClient

### Backend

- **Runtime:** Node.js v22
- **Framework:** NestJS (preferred) or Express
- **Database:** MongoDB (Mongoose)
- **Auth:** Airtable OAuth 2.0 (PKCE flow)
- **Scraping:** Puppeteer (cookie extraction) + Cheerio (HTML parsing)

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `@angular/material` | UI components |
| `ag-grid-angular` | Data grid |
| `ag-charts-angular` | Charts |
| `mongoose` | MongoDB ODM |
| `puppeteer` | Headless browser for cookie extraction |
| `cheerio` | HTML parsing for revision history |
| `p-limit` | Concurrency control for batch scraping |

---

## Module Build Order

```
1. Airtable OAuth 2.0 (backend token flow + Angular OAuth callback page)
2. API Sync — Bases → Tables → Tickets (pages) → Users → MongoDB with cursor pagination
3. Scraper — Puppeteer cookie extraction, MFA injection via API, session validity check
4. Revision History — fetch /readRowActivitiesAndComments per ticket, parse HTML, store { uuid, issueId, columnType, oldValue, newValue, createdDate, authoredBy }
5. Angular shell — routing, Angular Material layout, toolbar, sidebar
6. Entity dropdown — lists MongoDB collections from selected integration
7. AG Grid table — dynamic ColDef[] from collection schema, search, filter/sort
```

---

## Core Data Models (MongoDB)

```typescript
// bases collection
{ _id, airtableId, name, permissionLevel, syncedAt }

// tables collection
{ _id, airtableId, baseId, name, fields: [{ id, name, type }], syncedAt }

// tickets collection (pages)
{ _id, airtableId, baseId, tableId, fields: Record<string, any>, syncedAt }

// users collection
{ _id, airtableId, email, name, syncedAt }

// revisionHistory collection
{
  _id,
  uuid,          // activityId from Airtable
  issueId,       // ticketId (page id)
  columnType,    // field type changed (Assignee | Status)
  oldValue,
  newValue,
  createdDate,   // new Date(activityData.createdTime)
  authoredBy     // activityData.originatingUserId
}
```

---

## API Endpoints (Backend)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/airtable/connect` | Initiate OAuth PKCE flow |
| GET | `/auth/airtable/callback` | Handle OAuth redirect, store tokens |
| POST | `/sync/start` | Trigger full sync (bases → tables → tickets → users) |
| GET | `/sync/status` | Last sync time, record counts per collection |
| POST | `/scraper/start` | Start revision history scrape for all tickets |
| POST | `/scraper/cookie` | Accept MFA code from frontend, complete cookie extraction |
| GET | `/scraper/status` | Cookie validity, scrape progress |
| GET | `/collections` | List all MongoDB collection names |
| GET | `/collections/:name` | Paginated records + field names for AG Grid |

---

## Feature Development Workflow

### 3-Stage Pipeline

```
Stage 1: PLAN     → architect                → read report before proceeding
Stage 2: BUILD    → backend ∥ frontend       → implement per plan
Stage 3: VERIFY   → test-engineer + /review  → must pass before shipping
```

### Stage 1 — Plan

```
Task(architect, "Mode: system
Design [module] for FSD Airtable Integration Dashboard.
Stack: Node.js v22 + MongoDB + Angular 19.
Output: .claude/reports/arch/arch-[module]-YYYYMMDD.md")
```

### Stage 2 — Build (parallel)

```
Task(backend, "Implement [module] backend. Arch: [paste].
Build: Mongoose schema, service, controller/route, DTOs.
Output: .claude/reports/implementation/impl-[module]-backend-YYYYMMDD.md")

Task(frontend, "Build Angular [module] screens. Design: [paste]. API: [paste].
Build: components, services, Angular Material layout, AG Grid wiring.
Output: .claude/reports/implementation/impl-[module]-frontend-YYYYMMDD.md")
```

### Stage 3 — Verify

```
/review src/[module]/
/security src/[module]/
# Update .claude/reports/_registry.md
/commit
```

---

## Key Files

| Path | Purpose |
|------|---------|
| `frontend/` | Angular 19 app |
| `frontend/src/app/` | Components, services, modules |
| `frontend/src/app/dashboard/` | Main AG Grid dashboard |
| `frontend/src/app/auth/` | OAuth callback + login |
| `backend/` | Node.js API |
| `backend/src/modules/airtable/` | OAuth + API sync service |
| `backend/src/modules/scraper/` | Puppeteer cookie extractor + revision history |
| `backend/src/modules/collections/` | Dynamic MongoDB collection endpoints |
| `database/` | Mongoose schema definitions |

---

## Conventions

### Database

- **DB:** MongoDB via Mongoose
- **Upsert on sync:** use `updateOne({ airtableId }, doc, { upsert: true })` — no duplicates on re-sync
- **No soft deletes:** this is not PHI data; hard deletes are fine
- **Indexes:** compound index on `{ baseId, tableId }` for tickets; index on `issueId` for revisionHistory

### Backend

- **TypeScript strict mode** everywhere
- **Pagination:** Airtable uses `offset` cursor; MongoDB uses `skip`/`limit` with total count
- **Rate limiting:** max 5 req/sec per Airtable base — add 200ms delay between page requests
- **Concurrency:** use `p-limit(5)` for parallel ticket revision fetches

### Frontend

- **Angular standalone components** (no NgModules unless required by library)
- **Reactive approach:** Angular Signals for local state, RxJS for async HTTP streams
- **AG Grid:** always use `ColDef[]` generated dynamically from the collection's field names
- **No hardcoded columns** — all column definitions must be derived from MongoDB document shape

### Scraper

- **Cookie extraction:** Puppeteer launches headless Chromium, logs into Airtable, captures cookies after successful auth
- **MFA flow:** if 2FA screen detected, emit a waiting event; frontend polls `/scraper/status` and POSTs the code to `/scraper/cookie`
- **Cookie validation:** before each scrape batch, probe `/readRowActivitiesAndComments` with a known ticket; if 401/redirect → re-extract cookies
- **HTML parsing target:** only `columnType === 'Assignee'` or `columnType === 'Status'` — skip all other change types

### Security

- OAuth tokens stored server-side only (never sent to Angular client in full)
- Airtable cookies stored in memory / encrypted at rest — not in MongoDB
- No secrets in Angular bundle

---

## Project-Specific Skills

| Skill | Triggers On |
|-------|-------------|
| `airtable-integration` | Airtable, OAuth, bases, tables, tickets, pages, pagination, API sync |
| `mongodb-patterns` | MongoDB, Mongoose, collection, document, schema, upsert, aggregation |
| `web-scraping-patterns` | scraping, cookie, revision history, MFA, Puppeteer, Cheerio, session, HTML parse |
| `angular-patterns` | Angular, component, service, standalone, Angular Material, routing, RxJS |
| `ag-grid-patterns` | AG Grid, dynamic columns, ColDef, filter, sort, server-side row model, AG Charts |

---

## Commands

| Command | Purpose | Agent |
|---------|---------|-------|
| `/review` | Code review | code-quality |
| `/security` | Security scan | security-engineer |
| `/test` | Run Jest tests | test-engineer |
| `/data/analyze` | Airtable sync + collection stats | — |
| `/commit` | Commit with Conventional Commits | — |

---

## Report Locations

| Category | Purpose |
|----------|---------|
| `arch/` | DB schema, API design, ADRs |
| `implementation/` | Module build reports |
| `review/` | Code review reports |
| `security/` | Security scans |
| `tests/` | Test results |
| `bugs/` | Bug reports |
| `archive/rider-app/` | Previous project reports (Rider App) |

---

## Quick Reference

```bash
# Start backend
cd backend && npm run start:dev

# Start Angular frontend
cd frontend && ng serve

# Run tests
npm run test

# Check registry
cat .claude/reports/_registry.md

# Check tech debt
cat .claude/reports/_tech-debt.md
```

---

**Version:** 1.0.0
**Created:** 2026-06-19
**Task:** FSD Task — Airtable Integration Dashboard

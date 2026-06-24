# Project-Level Claude Code Configuration (`.claude/`)

This folder is the `.claude/` directory for the **FSD Task — Airtable Integration Dashboard**.

It contains:
- `CLAUDE.md` — project context (stack, conventions, module build order, skills)
- Project-specific commands and skills
- Report output folders and registries

---

## Directory Structure

```
.claude/
├── CLAUDE.md                              ← project instructions (read this first)
├── INDEX.md                               ← this file
├── MEMORY.md                              ← project memory index
├── commands/
│   └── data/
│       └── analyze.md                     # /data/analyze — sync stats, revision summary, scraper health
├── skills/
│   ├── angular/
│   │   ├── angular-patterns/              # Angular 19, Angular Material, RxJS, routing, services
│   │   └── ag-grid-patterns/              # AG Grid 33.0 dynamic columns, filter/sort, AG Charts
│   ├── integrations/
│   │   └── airtable-integration/          # OAuth 2.0 PKCE, API sync, pagination, rate limits
│   ├── backend/
│   │   ├── mongodb-patterns/              # Mongoose schemas, upsert, dynamic collection access
│   │   ├── web-scraping-patterns/         # Puppeteer cookies, MFA injection, Cheerio HTML parse
│   │   └── nestjs-patterns/              # [DEPRECATED — previous project]
│   ├── frontend/
│   │   ├── dashboard-patterns/            # Angular + AG Grid dashboard layout patterns
│   │   └── accessibility-checklist/       # WCAG AA checklist (still applicable)
│   ├── billing/                           # [DEPRECATED — previous project (Medical Billing)]
│   ├── compliance/                        # [DEPRECATED — previous project (HIPAA)]
│   ├── data-engineering/                  # [DEPRECATED — previous project (Somali Dialect)]
│   └── machine-learning/                  # [DEPRECATED — previous project (Somali Dialect)]
└── reports/
    ├── _registry.md                       # Completed work index
    ├── _tech-debt.md                      # Open tech debt
    ├── _registry-template.md              # Template for adding new entries
    ├── arch/                              # DB schema, API design, ADRs
    ├── implementation/                    # Module build reports (backend + frontend)
    ├── review/                            # Code review reports
    ├── security/                          # Security scan reports
    ├── sre/                               # Reliability reviews
    ├── tests/                             # Test results, QA reports
    ├── bugs/                              # Bug reports
    ├── design/                            # UI/UX design specs
    ├── rfc/                               # Design RFCs
    ├── exec/                              # Orchestration + agent handoff logs
    ├── handoff/                           # Agent context transfers
    ├── analysis/                          # /data/analyze output reports
    ├── ci/                                # CI pipeline results
    ├── commits/                           # Commit logs
    └── archive/
        └── rider-app/                     # Previous project reports (Rider App — Delivery Platform)
```

---

## Active Skills Quick Reference

| Skill | Auto-invokes on | Location |
|-------|----------------|----------|
| `angular-patterns` | Angular, component, service, standalone, Angular Material, RxJS, routing | `skills/angular/angular-patterns/` |
| `ag-grid-patterns` | AG Grid, dynamic columns, ColDef, filter, sort, server-side, AG Charts | `skills/angular/ag-grid-patterns/` |
| `airtable-integration` | Airtable, OAuth, bases, tables, tickets, pages, pagination, API sync | `skills/integrations/airtable-integration/` |
| `mongodb-patterns` | MongoDB, Mongoose, collection, document, schema, upsert, aggregation | `skills/backend/mongodb-patterns/` |
| `web-scraping-patterns` | scraping, cookie, revision history, MFA, Puppeteer, Cheerio, HTML parse | `skills/backend/web-scraping-patterns/` |
| `dashboard-patterns` | dashboard, integration dropdown, entity dropdown, search bar, loading state | `skills/frontend/dashboard-patterns/` |
| `accessibility-checklist` | accessibility, a11y, WCAG, ARIA, keyboard nav | `skills/frontend/accessibility-checklist/` |

---

## Module Build Order

```
1  → Airtable OAuth 2.0 (backend + Angular callback page)
2  → API Sync: Bases → Tables → Tickets → Users → MongoDB (with pagination)
3  → Scraper: Puppeteer cookie extraction + MFA injection
4  → Revision History: fetch, parse HTML, store { uuid, issueId, columnType, oldValue, newValue, createdDate, authoredBy }
5  → Angular shell: routing, layout, toolbar, sidenav
6  → Entity dropdown: MongoDB collection list
7  → AG Grid table: dynamic ColDef[], search, filter, sort
```

---

## Task Parts Summary

| Part | Scope |
|------|-------|
| **A** | Backend: Airtable OAuth + REST API sync to MongoDB (bases, tables, tickets, users) with cursor pagination |
| **B** | Backend: Cookie-based scraper (Puppeteer + Cheerio), MFA flow, session validity, revision history storage |
| **C** | Frontend: Angular 19 + Angular Material + AG Grid 33.0; integration dropdown, entity dropdown, search, filter/sort |

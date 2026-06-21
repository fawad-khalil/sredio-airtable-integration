---
description: Analyze Airtable integration data — collection stats, sync status, revision history summary, scraper health
argument-hint: [report-type] [collection-name]
---

# /data/analyze — Airtable Data Analysis

## Usage

```
/data/analyze sync-status                    # Sync state per collection
/data/analyze collections                    # Record counts per MongoDB collection
/data/analyze revisions [collection]         # Assignee + status change summary
/data/analyze scraper                        # Scraper health + cookie validity
/data/analyze coverage [baseId]              # Tickets scraped vs total tickets
```

---

## Report Types

### 1. Sync Status (`sync-status`)

| Collection | Record Count | Last Sync | Status |
|------------|-------------|-----------|--------|
| bases | N | YYYY-MM-DD HH:mm | OK / Stale |
| tables | N | YYYY-MM-DD HH:mm | OK / Stale |
| tickets | N | YYYY-MM-DD HH:mm | OK / Stale |
| users | N | YYYY-MM-DD HH:mm | OK / Stale |

Stale = last sync older than 24h.

### 2. Collection Stats (`collections`)

- List all MongoDB collections with document counts
- Flag empty collections
- Show field cardinality for the tickets collection (fields present in >80% of records)

### 3. Revision History Summary (`revisions`)

- Total revision entries stored
- Breakdown by `columnType` (Assignee vs Status)
- Top 10 most-changed tickets (by revision count)
- Date range of revisions (oldest → newest)
- Tickets with 0 revisions (not yet scraped or no changes)

### 4. Scraper Health (`scraper`)

- Cookie extraction status (valid / expired / never run)
- Last successful scrape timestamp
- Total tickets scraped vs total tickets in DB
- Error count from last scrape batch
- Pending MFA: yes/no

### 5. Coverage Report (`coverage`)

- Per base: total tickets in MongoDB vs tickets with at least 1 revision entry
- Highlight gaps where scrape failed
- Estimated time to scrape remaining tickets at current rate

---

## Output

Reports are written to: `.claude/reports/analysis/analysis-[type]-YYYYMMDD.md`

## After Analysis

Update `.claude/reports/_registry.md`:
```
- analysis-[type]-YYYYMMDD | Complete | [1-line summary]
```

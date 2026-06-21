# Web Scraping Patterns — FSD Task

**Auto-invokes on:** scraping, cookie, revision history, MFA, Puppeteer, Cheerio, session, HTML parse, /readRowActivitiesAndComments, changelog, headless browser

---

## Overview

Airtable's revision history is not available via public API. It is retrieved by:
1. Logging into Airtable via a headless browser (Puppeteer) to capture session cookies
2. Using those cookies to call the internal `/readRowActivitiesAndComments` endpoint
3. Parsing the HTML response with Cheerio to extract assignee/status changes

---

## Puppeteer Cookie Extraction

### Install

```bash
npm install puppeteer
```

### Login Flow + Cookie Capture

```typescript
import puppeteer, { Browser, Page } from 'puppeteer';

interface ScraperSession {
  cookies: string;   // serialized cookie header value
  isValid: boolean;
}

let browser: Browser | null = null;
let mfaResolver: ((code: string) => void) | null = null;

export async function extractCookies(email: string, password: string): Promise<ScraperSession> {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.goto('https://airtable.com/login');
  await page.type('input[name="email"]', email, { delay: 50 });
  await page.type('input[name="password"]', password, { delay: 50 });
  await page.click('button[type="submit"]');

  // Wait for either MFA screen or dashboard
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });

  if (await isMfaPage(page)) {
    // Signal frontend that MFA is needed — block until code is submitted
    const mfaCode = await waitForMfaCode();
    await page.type('input[name="mfaCode"]', mfaCode);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  }

  const rawCookies = await page.cookies();
  await browser.close();
  browser = null;

  const cookieHeader = rawCookies.map(c => `${c.name}=${c.value}`).join('; ');
  return { cookies: cookieHeader, isValid: true };
}

async function isMfaPage(page: Page): Promise<boolean> {
  return !!(await page.$('input[name="mfaCode"]'));
}
```

---

## MFA Code Injection

Frontend POSTs the code; backend resumes the blocked Puppeteer flow.

```typescript
// Backend: expose pending MFA resolver
let pendingMfaResolve: ((code: string) => void) | null = null;

function waitForMfaCode(): Promise<string> {
  return new Promise(resolve => {
    pendingMfaResolve = resolve;
  });
}

// Called by controller when frontend submits /scraper/cookie
export function submitMfaCode(code: string) {
  if (pendingMfaResolve) {
    pendingMfaResolve(code);
    pendingMfaResolve = null;
  }
}

// Scraper status endpoint — signals MFA is needed
export function getScraperStatus(): ScraperStatus {
  return {
    state: pendingMfaResolve ? 'awaiting_mfa' : 'idle',
    cookieValid: cachedSession?.isValid ?? false,
  };
}
```

### Angular Frontend Polling

```typescript
// Poll /scraper/status every 3s; show MFA input form when state === 'awaiting_mfa'
readonly scraperStatus = toSignal(
  interval(3000).pipe(switchMap(() => this.scraperService.getStatus())),
  { initialValue: { state: 'idle' } }
);
```

---

## Cookie Validity Check

Before each scrape batch, validate cookies with a probe request.

```typescript
async function isCookieValid(cookies: string, sampleTicketId: string): Promise<boolean> {
  const res = await fetch('https://airtable.com/v0.3/row/readRowActivitiesAndComments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
      'x-airtable-application-id': 'appXXX',  // any valid base id
    },
    body: JSON.stringify({ rowId: sampleTicketId }),
  });
  return res.status !== 401 && res.status !== 302 && res.status !== 403;
}
```

If invalid, re-run `extractCookies()` before proceeding.

---

## Fetching Revision History per Ticket

```typescript
async function fetchRevisionHistory(cookies: string, baseId: string, ticketId: string): Promise<string> {
  const res = await fetch('https://airtable.com/v0.3/row/readRowActivitiesAndComments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
      'x-airtable-application-id': baseId,
    },
    body: JSON.stringify({ rowId: ticketId }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ticket ${ticketId}`);
  return res.text();   // returns HTML
}
```

---

## HTML Parsing with Cheerio

### Install

```bash
npm install cheerio
```

### Parse Revision History HTML

```typescript
import * as cheerio from 'cheerio';

interface RevisionEntry {
  uuid: string;
  issueId: string;
  columnType: string;
  oldValue: string;
  newValue: string;
  createdDate: Date;
  authoredBy: string;
}

function parseRevisionHistory(html: string, ticketId: string): RevisionEntry[] {
  const $ = cheerio.load(html);
  const entries: RevisionEntry[] = [];

  // Airtable activity items — inspect actual HTML to refine selectors
  $('[data-activity-id]').each((_, el) => {
    const activityId = $(el).attr('data-activity-id') ?? '';
    const columnType = $(el).attr('data-column-type') ?? $(el).find('.columnType').text().trim();

    // Only capture Assignee and Status changes
    if (!['Assignee', 'Status'].includes(columnType)) return;

    const oldValue = $(el).find('.oldValue').text().trim();
    const newValue = $(el).find('.newValue').text().trim();
    const createdTimeStr = $(el).attr('data-created-time') ?? $(el).find('time').attr('datetime') ?? '';
    const authoredBy = $(el).attr('data-user-id') ?? '';

    entries.push({
      uuid: activityId,
      issueId: ticketId,
      columnType,
      oldValue,
      newValue,
      createdDate: new Date(createdTimeStr),
      authoredBy,
    });
  });

  return entries;
}
```

> **Note:** The exact HTML selectors depend on Airtable's rendered markup. Inspect the actual response with `console.log(html)` on first run and refine selectors accordingly. The `data-*` attributes above are illustrative.

---

## Batch Processing (200+ Tickets)

```typescript
import pLimit from 'p-limit';  // npm install p-limit

async function scrapeAllTickets(cookies: string, baseId: string, ticketIds: string[]) {
  const limit = pLimit(5);   // max 5 concurrent requests to Airtable
  const allEntries: RevisionEntry[] = [];

  await Promise.all(ticketIds.map(ticketId =>
    limit(async () => {
      try {
        const html = await fetchRevisionHistory(cookies, baseId, ticketId);
        const entries = parseRevisionHistory(html, ticketId);
        allEntries.push(...entries);
        await upsertRevisionEntries(entries);
      } catch (err) {
        console.error(`Failed ticket ${ticketId}:`, err);
        // Log and continue — don't abort the whole batch
      }
    })
  ));

  return allEntries.length;
}
```

---

## Upsert Revision Entries to MongoDB

```typescript
async function upsertRevisionEntries(entries: RevisionEntry[]) {
  if (!entries.length) return;
  const ops = entries.map(e => ({
    updateOne: {
      filter: { uuid: e.uuid },
      update: { $set: e },
      upsert: true,
    }
  }));
  await RevisionHistoryModel.bulkWrite(ops, { ordered: false });
}
```

---

## Scraper State Machine

```
idle
  → extracting_cookies  (POST /scraper/start)
  → awaiting_mfa        (if 2FA detected)
  → scraping            (POST /scraper/cookie with MFA code)
  → complete
  → error
```

Frontend polls `GET /scraper/status` and transitions UI accordingly.

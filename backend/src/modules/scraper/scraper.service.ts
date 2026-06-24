import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { execSync } from 'child_process';
import * as cheerio from 'cheerio';
import axios from 'axios';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Ticket, TicketDocument } from '../../schemas/ticket.schema';
import { RevisionHistory, RevisionHistoryDocument } from '../../schemas/revision-history.schema';

type ScraperState = 'idle' | 'extracting_cookies' | 'awaiting_login' | 'awaiting_mfa' | 'scraping' | 'complete' | 'error';

/** Simple concurrency limiter to replace ESM-only p-limit */
function makeLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const fn = queue.shift()!;
    fn();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private state: ScraperState = 'idle';
  private progress = { current: 0, total: 0 };
  private message = '';
  private readonly cookieTtlFallback: number;
  private connectionId: string = '';
  private mfaResolver: ((code: string) => void) | null = null;
  private mfaPrompts = 0;
  private loggedMfaInputs = false;

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(RevisionHistory.name) private revisionModel: Model<RevisionHistoryDocument>,
  ) {
    this.cookieTtlFallback = Number(config.get('REDIS_COOKIE_TTL', 604800));
  }

  async onModuleInit(): Promise<void> {
    // Rebuild the schema's unique { uuid } index. Resilient: a leftover duplicate from the old
    // { uuid, connectionId } scheme must not crash startup (drop the collection to rebuild).
    await this.revisionModel.syncIndexes().catch((err: Error) =>
      this.logger.warn(`syncIndexes failed for RevisionHistory: ${err.message}`),
    );
  }

  private cookieKey(connectionId: string): string {
    return `scraper:cookies:${connectionId}`;
  }

  private async getConnectionCookies(connectionId = this.connectionId): Promise<string> {
    return (await this.redis.get(this.cookieKey(connectionId))) ?? '';
  }

  private async setConnectionCookies(
    value: string,
    connectionId = this.connectionId,
    ttlSeconds = this.cookieTtlFallback,
  ): Promise<void> {
    const key = this.cookieKey(connectionId);
    if (value) await this.redis.set(key, value.trim(), 'EX', Math.max(1, ttlSeconds));
    else await this.redis.del(key);
  }

  /** Redis TTL (seconds) derived from the furthest-future cookie expiry; falls back to the configured default. */
  private cookiesTtl(cookies: { expires?: number }[]): number {
    const now = Math.floor(Date.now() / 1000);
    const maxExpires = Math.max(0, ...cookies.map(c => c.expires ?? 0));
    const ttl = maxExpires - now;
    return ttl > 0 ? ttl : this.cookieTtlFallback;
  }

  async getStatus(connectionId: string) {
    return {
      state: this.state,
      progress: this.progress,
      message: this.message,
      hasCookies: !!(await this.getConnectionCookies(connectionId)),
      mfaPrompts: this.mfaPrompts,
    };
  }

  async setCookies(connectionId: string, cookieString: string): Promise<void> {
    await this.setConnectionCookies(cookieString, connectionId);
    this.logger.log('Cookies set manually');
  }

  submitMfaCode(code: string): void {
    if (this.mfaResolver) {
      this.mfaResolver(code);
      this.mfaResolver = null;
    }
  }

  async startScrape(
    connectionId: string,
    opts: { method?: string; email?: string; password?: string } = {},
  ): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'complete' && this.state !== 'error') return;
    this.connectionId = connectionId;
    this.progress = { current: 0, total: 0 };
    this.mfaPrompts = 0;
    this.loggedMfaInputs = false;

    try {
      if (await this.getConnectionCookies()) {
        const isValid = await this.validateCookies();
        if (!isValid) await this.setConnectionCookies('');
      }

      if (!(await this.getConnectionCookies())) {
        this.state = 'extracting_cookies';
        if (opts.method === 'credentials' && opts.email && opts.password) {
          this.message = 'Logging into Airtable…';
          await this.extractCookiesWithCredentials(opts.email, opts.password);
        } else {
          this.message = 'Opening browser for Airtable login...';
          await this.extractCookies();
        }
        const isValid = await this.validateCookies();
        if (!isValid) throw new Error('Cookie extraction succeeded but cookies are invalid');
      }

      await this.scrapeAllTickets();
      this.state = 'complete';
      this.message = `Scraped ${this.progress.total} tickets successfully`;
    } catch (err) {
      this.state = 'error';
      this.message = (err as Error).message;
      this.logger.error('Scraper error:', err);
    }
  }

  private async extractCookies(): Promise<void> {
    const { default: puppeteer } = await (new Function('return import("puppeteer")')() as Promise<typeof import('puppeteer')>);
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null,
    });
    const page = await browser.newPage();

    try {
      await page.goto('https://airtable.com/login', { waitUntil: 'networkidle2', timeout: 30000 });

      this.state = 'awaiting_login';
      this.message = "Browser opened. Please log in to Airtable (Google, email, or SSO). The scraper will continue automatically once you're logged in.";

      await page.waitForFunction(
        () => {
          const url = window.location.href;
          return (
            !url.includes('/login') &&
            !url.includes('/sso') &&
            !/\/(2fa|otp|two-factor|mfa|verify)/.test(url)
          );
        },
        { timeout: 300000 },
      );

      this.state = 'extracting_cookies';
      this.message = 'Login detected. Extracting cookies...';

      const pageCookies = await page.cookies();
      await this.setConnectionCookies(
        pageCookies.map(c => `${c.name}=${c.value}`).join('; '),
        this.connectionId,
        this.cookiesTtl(pageCookies),
      );
      this.logger.log(`Extracted ${pageCookies.length} cookies`);
    } finally {
      await browser.close();
    }
  }

  /** Auto-filled email/password login in a visible browser; pauses for an MFA code from the dashboard if 2FA is shown. */
  private async extractCookiesWithCredentials(email: string, password: string): Promise<void> {
    // Capture frontmost app before Puppeteer steals focus, so we can restore it at the MFA screen
    let prevApp = '';
    if (process.platform === 'darwin') {
      try {
        prevApp = execSync(
          `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`
        ).toString().trim();
      } catch {}
    }

    const { default: puppeteer } = await (new Function('return import("puppeteer")')() as Promise<typeof import('puppeteer')>);
    // Visible (headful) browser: Airtable's PerimeterX bot detection serves headless Chromium a challenge page (no login form).
    // --window-position spawns it off all screens so it never flashes on screen — credentials are auto-typed, the user never needs it.
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-position=-3840,0'],
      defaultViewport: null,
    });
    const page = await browser.newPage();

    // Belt-and-suspenders: move the window off-screen via CDP in case the launch arg is ignored, then restore the user's app focus.
    try {
      const cdp = await page.target().createCDPSession();
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: -3840, top: 0, width: 1280, height: 800 } });
      await cdp.detach();
    } catch {}
    if (prevApp && process.platform === 'darwin') {
      try { execSync(`osascript -e 'tell application "${prevApp}" to activate'`); } catch {}
    }

    try {
      await page.goto('https://airtable.com/login', { waitUntil: 'networkidle2', timeout: 30000 });

      try {
        await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 20000 });
      } catch {
        this.logger.warn(`Login page selector not found. url=${page.url()} title=${await page.title()}`);
        throw new Error('Could not find the email field on Airtable login (page may have changed or login was blocked).');
      }
      await page.type('input[name="email"], input[type="email"]', email, { delay: 30 });
      await page.keyboard.press('Enter');

      try {
        await page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 15000 });
      } catch {
        throw new Error('Login failed — could not proceed past the email step (check the email address).');
      }
      await page.type('input[name="password"], input[type="password"]', password, { delay: 30 });
      await page.keyboard.press('Enter');
      // networkidle2: waits for SPA async requests + React render to complete after login.
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});

      await this.completeLoginWithOptionalMfa(page);

      this.state = 'extracting_cookies';
      this.message = 'Login detected. Extracting cookies...';

      const pageCookies = await page.cookies();
      await this.setConnectionCookies(
        pageCookies.map(c => `${c.name}=${c.value}`).join('; '),
        this.connectionId,
        this.cookiesTtl(pageCookies),
      );
      this.logger.log(`Extracted ${pageCookies.length} cookies (credentials login)`);
    } finally {
      await browser.close();
    }
  }

  /** Wait until logged in; if a 2FA screen appears, pause for the code submitted from the dashboard. */
  private async completeLoginWithOptionalMfa(page: any): Promise<void> {
    const mfaSelector = 'input[name="mfaCode"], input[autocomplete="one-time-code"], input[type="tel"], input[inputmode="numeric"]';
    const deadline = Date.now() + 300000;
    // Track how long we've been stuck on the login/sso screen after submitting the password
    let loginGraceDeadline = 0;

    while (Date.now() < deadline) {
      const url = page.url();

      // Still on login/SSO flow — either navigation is in progress, or the credentials were rejected
      if (url.includes('/login') || url.includes('/sso')) {
        // Scan for an explicit auth-error message (safe mid-navigation via .catch)
        const hasError = await page.evaluate(() => {
          const t = (document.body?.innerText ?? '').toLowerCase();
          return /incorrect|wrong password|couldn.?t find|doesn.?t match|invalid|no account|try again/.test(t);
        }).catch(() => false);

        if (!loginGraceDeadline) loginGraceDeadline = Date.now() + 10000;

        // Fail fast on an explicit error (after a brief settle), or when the grace window elapses
        if ((hasError && Date.now() > loginGraceDeadline - 7000) || Date.now() > loginGraceDeadline) {
          throw new Error('Login failed — please check your email and password and try again.');
        }
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      loginGraceDeadline = 0; // left the login screen — reset

      const onMfaPage = /\/(2fa|otp|two-factor|mfa|verify)/.test(url);

      if (onMfaPage) {
        // One-time diagnostic: log all inputs on the MFA page to verify selector
        if (!this.loggedMfaInputs) {
          this.loggedMfaInputs = true;
          try {
            const inputs = await page.evaluate(() =>
              Array.from(document.querySelectorAll('input')).map((i: any) => ({
                name: i.name, type: i.type, autocomplete: i.autocomplete,
                maxlength: i.maxLength, placeholder: i.placeholder.slice(0, 30),
              }))
            );
            this.logger.log(`MFA page inputs: ${JSON.stringify(inputs)}`);
          } catch {}
        }

        // Window is already off-screen and the user's app already refocused (done at launch) —
        // the user enters the code in the dashboard MFA dialog. mfaPrompts bumps each (re)ask so
        // the dashboard can tell when a previous code was rejected.
        this.mfaPrompts++;
        this.state = 'awaiting_mfa';
        this.message = this.mfaPrompts > 1
          ? 'Invalid code. Please re-enter the code from your authenticator.'
          : 'MFA required. Enter the code from your authenticator in the dashboard.';
        await new Promise(r => setTimeout(r, 500)); // let the (re)loaded page render

        const code = await this.waitForMfaCode();

        // Try single-input OTP first, then split digit-per-box fallback
        let typed = false;
        try {
          await page.waitForSelector(mfaSelector, { timeout: 5000 });
          await page.type(mfaSelector, code, { delay: 50 });
          typed = true;
        } catch {}

        if (!typed) {
          try {
            const digitBoxes = await page.$$('input[maxlength="1"]');
            if (digitBoxes.length >= code.length) {
              for (let i = 0; i < code.length; i++) {
                await digitBoxes[i].type(code[i], { delay: 50 });
              }
              typed = true;
            }
          } catch {}
        }

        this.logger.log(`MFA code entry: typed=${typed}`);

        // The form POSTs and navigates: wrong code reloads /2fa, correct code redirects away.
        const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
        try { await page.keyboard.press('Enter'); } catch {}
        await nav.catch(() => {});

        // Loop re-evaluates the URL: still on /2fa → wrong code → re-prompt; otherwise → proceed.
        continue;
      }

      // Not on login or MFA page — logged in
      return;
    }

    throw new Error('Login timed out — check email/password or MFA code');
  }

  private waitForMfaCode(): Promise<string> {
    return new Promise(resolve => {
      this.mfaResolver = resolve;
    });
  }

  private async validateCookies(): Promise<boolean> {
    const cookies = await this.getConnectionCookies();
    if (!cookies) return false;
    try {
      const ticket = await this.ticketModel.findOne({}).lean();
      if (!ticket) return true; // nothing to probe against, assume valid
      const { url, config } = this.buildActivitiesRequest(ticket.baseId, ticket.airtableId, cookies);
      const resp = await axios.get(url, { ...config, maxRedirects: 0, validateStatus: () => true });
      this.logger.log(`Cookie validation probe returned HTTP ${resp.status}`);
      return resp.status === 200;
    } catch (err) {
      this.logger.warn(`Cookie validation error: ${(err as Error).message}`);
      return false;
    }
  }

  /** Build the GET request (url + axios config) for Airtable's internal revision-history endpoint. */
  private buildActivitiesRequest(baseId: string, rowId: string, cookies: string, offsetV2: string | null = null) {
    const stringifiedObjectParams = JSON.stringify({
      limit: 100,
      offsetV2,
      shouldIncludeOnlyRowLevelComments: false,
      shouldIncludeRowActivityOrCommentUserObjById: true,
    });
    const requestId = 'req' + Math.random().toString(36).slice(2, 16);
    return {
      url: `https://airtable.com/v0.3/row/${rowId}/readRowActivitiesAndComments`,
      config: {
        params: { stringifiedObjectParams, requestId },
        headers: {
          accept: 'application/json, text/javascript, */*; q=0.01',
          Cookie: cookies,
          'x-airtable-application-id': baseId,
          'x-airtable-inter-service-client': 'webClient',
          'x-requested-with': 'XMLHttpRequest',
          'x-time-zone': 'Asia/Karachi',
          'x-user-locale': 'en',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        },
      },
    };
  }

  private async scrapeAllTickets(): Promise<void> {
    const cookies = await this.getConnectionCookies();
    const tickets = await this.ticketModel.find({}).lean();
    this.state = 'scraping';
    this.progress = { current: 0, total: tickets.length };
    this.message = `Scraping revision history for ${tickets.length} tickets...`;
    await this.revisionModel.deleteMany({}); // full rebuild — avoids stale/duplicate docs

    const limit = makeLimiter(5);

    await Promise.all(
      tickets.map(ticket =>
        limit(async () => {
          try {
            const entries = await this.fetchRevisionHistory(ticket.baseId, ticket.airtableId, cookies);
            if (entries.length > 0) {
              await this.upsertRevisionEntries(entries);
            }
          } catch (err) {
            this.logger.warn(`Failed to scrape ticket ${ticket.airtableId}: ${(err as Error).message}`);
          } finally {
            this.progress.current++;
          }
        }),
      ),
    );
  }

  private async fetchRevisionHistory(baseId: string, ticketId: string, cookies: string): Promise<any[]> {
    const all: any[] = [];
    let offsetV2: string | null = null;
    let guard = 0;
    do {
      const { url, config } = this.buildActivitiesRequest(baseId, ticketId, cookies, offsetV2);
      const { data } = await axios.get(url, config);

      all.push(...this.parseRevisionHistory(data, ticketId));

      const payload = data?.data ?? data;
      const ids: unknown[] = payload?.orderedActivityAndCommentIds ?? [];
      const next: string | null = payload?.offsetV2 ?? null;

      // One-time diagnostic
      if (!this.loggedActivityKeys) {
        this.loggedActivityKeys = true;
        this.logger.log(`Activity page: ids=${ids.length} offsetV2=${JSON.stringify(next)}`);
      }

      // Airtable signals the last page with offsetV2: null. Continue while a new token comes back
      // (next !== offsetV2 is an anti-loop guard).
      offsetV2 = next && next !== offsetV2 ? next : null;
      if (offsetV2) await new Promise(r => setTimeout(r, 200)); // polite delay between pages
    } while (offsetV2 && ++guard < 100); // hard cap: 100 pages (~10k activities) per ticket

    return all;
  }

  private loggedMatchedDiff = false;
  private loggedActivityKeys = false;

  private parseRevisionHistory(data: any, ticketId: string): any[] {
    const entries: any[] = [];

    // Response is a JSON envelope: { msg: 'SUCCESS', data: { rowActivityInfoById: {...} } }
    const payload = data?.data ?? data;
    const activityInfo = payload?.rowActivityInfoById;
    if (!activityInfo || typeof activityInfo !== 'object') return entries;

    for (const [activityId, info] of Object.entries<any>(activityInfo)) {
      const diffHtml: string | undefined = info?.diffRowHtml;
      if (!diffHtml || typeof diffHtml !== 'string') continue;

      const changes = this.parseDiffRowHtml(diffHtml);
      if (changes.length === 0) continue;

      // Log the first parsed diff once, to verify value extraction.
      if (!this.loggedMatchedDiff) {
        this.loggedMatchedDiff = true;
        this.logger.log(`First diffRowHtml (ticket ${ticketId}): ${diffHtml.slice(0, 1500)}`);
      }

      changes.forEach((c, i) => {
        entries.push({
          uuid: changes.length > 1 ? `${activityId}-${i}` : activityId,
          issueId: ticketId,
          columnType: c.columnType,
          oldValue: c.oldValue,
          newValue: c.newValue,
          createdDate: new Date(info.createdTime),
          authoredBy: info.originatingUserId ?? '',
          syncedAt: new Date(),
        });
      });
    }

    return entries;
  }

  /** Extract per-column { columnType, oldValue, newValue } from an activity's diffRowHtml. */
  private parseDiffRowHtml(html: string): { columnType: string; oldValue: string; newValue: string }[] {
    const $ = cheerio.load(html);
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    // Removed/old tokens are struck through (pills: inline line-through; text: strikethrough class).
    const isRemoved = (_i: number, node: any): boolean => {
      const $n = $(node);
      const style = $n.attr('style') ?? '';
      const cls = $n.attr('class') ?? '';
      return /line-through/.test(style) || /strikethrough/.test(cls) || /colors-background-negative/.test(cls);
    };
    const results: { columnType: string; oldValue: string; newValue: string }[] = [];

    $('.historicalCellContainer').each((_, el) => {
      const columnType = norm($(el).children().first().text()); // first child div = column label
      if (!columnType) return;

      const container = $(el).find('.historicalCellValueContainer').first();
      const scope = (container.length ? container : $(el).find('.historicalCellValue').first()).clone();
      scope.find('[aria-hidden="true"]').remove(); // drop avatar initials & +/- badge icons

      // Old = struck-through tokens; New = everything else.
      const oldValue = norm(
        scope.find('*').filter(isRemoved).map((_i, n) => $(n).text()).get().join(' '),
      );
      const newClone = scope.clone();
      newClone.find('*').filter(isRemoved).remove();
      const newValue = norm(newClone.text());

      results.push({ columnType, oldValue, newValue });
    });

    return results;
  }

  private async upsertRevisionEntries(entries: any[]): Promise<void> {
    const ops = entries.map(e => ({
      updateOne: {
        filter: { uuid: e.uuid },
        update: { $set: e },
        upsert: true,
      },
    }));
    await this.revisionModel.bulkWrite(ops);
  }
}

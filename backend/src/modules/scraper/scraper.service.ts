import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
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
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private state: ScraperState = 'idle';
  private progress = { current: 0, total: 0 };
  private message = '';
  private cookies: string = '';
  private connectionId: string = '';
  private mfaResolver: ((code: string) => void) | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(RevisionHistory.name) private revisionModel: Model<RevisionHistoryDocument>,
  ) {}

  getStatus() {
    return {
      state: this.state,
      progress: this.progress,
      message: this.message,
      hasCookies: !!this.cookies,
    };
  }

  setCookies(cookieString: string): void {
    this.cookies = cookieString.trim();
    this.logger.log('Cookies set manually');
  }

  submitMfaCode(code: string): void {
    if (this.mfaResolver) {
      this.mfaResolver(code);
      this.mfaResolver = null;
    }
  }

  async startScrape(connectionId: string): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'complete' && this.state !== 'error') return;
    this.connectionId = connectionId;
    this.progress = { current: 0, total: 0 };

    try {
      if (this.cookies) {
        const isValid = await this.validateCookies();
        if (!isValid) this.cookies = '';
      }

      if (!this.cookies) {
        this.state = 'extracting_cookies';
        this.message = 'Opening browser for Airtable login...';
        await this.extractCookies();
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
        () => !window.location.href.includes('/login') && !window.location.href.includes('/sso'),
        { timeout: 300000 },
      );

      this.state = 'extracting_cookies';
      this.message = 'Login detected. Extracting cookies...';

      const pageCookies = await page.cookies();
      this.cookies = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');
      this.logger.log(`Extracted ${pageCookies.length} cookies`);
    } finally {
      await browser.close();
    }
  }

  private waitForMfaCode(): Promise<string> {
    return new Promise(resolve => {
      this.mfaResolver = resolve;
    });
  }

  private async validateCookies(): Promise<boolean> {
    if (!this.cookies) return false;
    try {
      const filter = this.connectionId ? { connectionId: this.connectionId } : {};
      const ticket = await this.ticketModel.findOne(filter).lean();
      if (!ticket) return true;
      const url = `https://airtable.com/v0.3/row/${ticket.airtableId}/readRowActivitiesAndComments`;
      const resp = await axios.get(url, {
        headers: { Cookie: this.cookies, 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 0,
        validateStatus: s => s < 400 || s === 400,
      });
      return resp.status < 400;
    } catch {
      return false;
    }
  }

  private async scrapeAllTickets(): Promise<void> {
    const filter = this.connectionId ? { connectionId: this.connectionId } : {};
    const tickets = await this.ticketModel.find(filter).lean();
    this.state = 'scraping';
    this.progress = { current: 0, total: tickets.length };
    this.message = `Scraping revision history for ${tickets.length} tickets...`;

    const limit = makeLimiter(5);

    await Promise.all(
      tickets.map(ticket =>
        limit(async () => {
          try {
            const entries = await this.fetchRevisionHistory(ticket.airtableId);
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

  private async fetchRevisionHistory(ticketId: string): Promise<any[]> {
    const url = `https://airtable.com/v0.3/row/${ticketId}/readRowActivitiesAndComments`;
    const { data } = await axios.get(url, {
      headers: {
        Cookie: this.cookies,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    return this.parseRevisionHistory(data, ticketId);
  }

  private parseRevisionHistory(html: string, ticketId: string): any[] {
    const entries: any[] = [];

    try {
      const json = typeof html === 'string' ? JSON.parse(html) : html;
      const activities = json.activities || (json.data && json.data.activities) || [];
      for (const activity of activities) {
        const columnType = activity.columnType || activity.type || '';
        if (!['Assignee', 'Status', 'assignee', 'status'].includes(columnType)) continue;
        entries.push({
          uuid: activity.id || activity.activityId || `${ticketId}-${Date.now()}`,
          connectionId: this.connectionId,
          issueId: ticketId,
          columnType,
          oldValue: activity.oldValue ?? '',
          newValue: activity.newValue ?? '',
          createdDate: new Date(activity.createdTime || activity.created_at || Date.now()),
          authoredBy: activity.originatingUserId || activity.userId || '',
          syncedAt: new Date(),
        });
      }
      return entries;
    } catch {
      // Not JSON, parse HTML with Cheerio
    }

    const $ = cheerio.load(html);
    $('[data-activity-id], .activityItem, .historyItem, [class*="activity"], [class*="history"]').each((_, el) => {
      const activityId = $(el).attr('data-activity-id') || $(el).attr('data-id') || `${ticketId}-${Date.now()}-${Math.random()}`;
      const text = $(el).text();

      let columnType = '';
      if (/assignee/i.test(text)) columnType = 'Assignee';
      else if (/status/i.test(text)) columnType = 'Status';
      else return;

      const oldValueEl = $(el).find('[data-old-value], .oldValue, [class*="old"]').first();
      const newValueEl = $(el).find('[data-new-value], .newValue, [class*="new"]').first();
      const timeEl = $(el).find('time, [data-created], [class*="time"], [class*="date"]').first();
      const authorEl = $(el).find('[data-user-id], [class*="author"], [class*="user"]').first();

      entries.push({
        uuid: activityId,
        connectionId: this.connectionId,
        issueId: ticketId,
        columnType,
        oldValue: oldValueEl.text().trim() || '',
        newValue: newValueEl.text().trim() || '',
        createdDate: new Date(timeEl.attr('datetime') || timeEl.text() || Date.now()),
        authoredBy: authorEl.attr('data-user-id') || authorEl.text().trim() || '',
        syncedAt: new Date(),
      });
    });

    return entries;
  }

  private async upsertRevisionEntries(entries: any[]): Promise<void> {
    const ops = entries.map(e => ({
      updateOne: {
        filter: { uuid: e.uuid, connectionId: e.connectionId },
        update: { $set: e },
        upsert: true,
      },
    }));
    await this.revisionModel.bulkWrite(ops);
  }
}

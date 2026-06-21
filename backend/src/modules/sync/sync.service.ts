import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { AuthService } from '../auth/auth.service';
import { Base, BaseDocument } from '../../schemas/base.schema';
import { Table, TableDocument } from '../../schemas/table.schema';
import { Ticket, TicketDocument } from '../../schemas/ticket.schema';
import { User, UserDocument } from '../../schemas/user.schema';

const AIRTABLE_BASE = 'https://api.airtable.com/v0';
const DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private syncStatus = { bases: 0, tables: 0, tickets: 0, users: 0, lastSync: null as string | null, syncing: false };

  constructor(
    private readonly authService: AuthService,
    @InjectModel(Base.name) private baseModel: Model<BaseDocument>,
    @InjectModel(Table.name) private tableModel: Model<TableDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private get headers() {
    return { Authorization: `Bearer ${this.authService.getAccessToken()}` };
  }

  async startSync(): Promise<void> {
    if (this.syncStatus.syncing) return;
    this.syncStatus.syncing = true;
    try {
      await this.syncBases();
      await this.syncCurrentUser();
      this.syncStatus.lastSync = new Date().toISOString();
    } finally {
      this.syncStatus.syncing = false;
    }
  }

  private async syncBases(): Promise<void> {
    this.logger.log('Syncing bases...');
    let offset: string | undefined;
    const allBases: any[] = [];
    do {
      const params: Record<string, string> = {};
      if (offset) params.offset = offset;
      const { data } = await axios.get(`${AIRTABLE_BASE}/meta/bases`, { headers: this.headers, params });
      allBases.push(...data.bases);
      offset = data.offset;
      if (offset) await sleep(DELAY_MS);
    } while (offset);

    for (const base of allBases) {
      await this.baseModel.updateOne(
        { airtableId: base.id },
        { airtableId: base.id, name: base.name, permissionLevel: base.permissionLevel, syncedAt: new Date() },
        { upsert: true },
      );
    }
    this.syncStatus.bases = allBases.length;
    this.logger.log(`Synced ${allBases.length} bases`);

    for (const base of allBases) {
      await this.syncTables(base.id);
      await sleep(DELAY_MS);
    }
  }

  private async syncTables(baseId: string): Promise<void> {
    const { data } = await axios.get(`${AIRTABLE_BASE}/meta/bases/${baseId}/tables`, { headers: this.headers });
    const tables = data.tables ?? [];

    for (const table of tables) {
      await this.tableModel.updateOne(
        { airtableId: table.id },
        { $set: { airtableId: table.id, baseId, name: table.name, fields: table.fields ?? [], syncedAt: new Date() } },
        { upsert: true },
      );
    }
    this.syncStatus.tables += tables.length;
    this.logger.log(`Synced ${tables.length} tables for base ${baseId}`);

    for (const table of tables) {
      await this.syncTickets(baseId, table.id, table.name);
      await sleep(DELAY_MS);
    }
  }

  private async syncTickets(baseId: string, tableId: string, tableName: string): Promise<void> {
    let offset: string | undefined;
    let count = 0;
    do {
      const params: Record<string, string> = { pageSize: '100' };
      if (offset) params.offset = offset;
      const { data } = await axios.get(`${AIRTABLE_BASE}/${baseId}/${tableId}`, { headers: this.headers, params });
      const records: any[] = data.records ?? [];

      if (records.length > 0) {
        const ops = records.map(r => ({
          updateOne: {
            filter: { airtableId: r.id },
            update: { $set: { airtableId: r.id, baseId, tableId, tableName, fields: r.fields ?? {}, syncedAt: new Date() } },
            upsert: true,
          },
        }));
        await this.ticketModel.bulkWrite(ops);
        count += records.length;
      }

      offset = data.offset;
      if (offset) await sleep(DELAY_MS);
    } while (offset);

    this.syncStatus.tickets += count;
    this.logger.log(`Synced ${count} tickets for table ${tableName}`);
  }

  private async syncCurrentUser(): Promise<void> {
    try {
      const { data } = await axios.get(`${AIRTABLE_BASE}/meta/whoami`, { headers: this.headers });
      await this.userModel.updateOne(
        { airtableId: data.id },
        { airtableId: data.id, email: data.email ?? '', name: data.name ?? data.email ?? 'Unknown', syncedAt: new Date() },
        { upsert: true },
      );
      this.syncStatus.users = 1;
    } catch (err) {
      this.logger.warn('Could not sync user: ' + (err as Error).message);
    }
  }

  getStatus() {
    return { ...this.syncStatus };
  }
}

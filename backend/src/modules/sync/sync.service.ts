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

export interface SyncStatusEntry {
  bases: number;
  tables: number;
  tickets: number;
  users: number;
  lastSync: string | null;
  syncing: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly syncStatuses = new Map<string, SyncStatusEntry>();

  constructor(
    private readonly authService: AuthService,
    @InjectModel(Base.name) private baseModel: Model<BaseDocument>,
    @InjectModel(Table.name) private tableModel: Model<TableDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private getStatus(connectionId: string): SyncStatusEntry {
    if (!this.syncStatuses.has(connectionId)) {
      this.syncStatuses.set(connectionId, { bases: 0, tables: 0, tickets: 0, users: 0, lastSync: null, syncing: false });
    }
    return this.syncStatuses.get(connectionId)!;
  }

  private async headers(connectionId: string): Promise<{ Authorization: string }> {
    return { Authorization: `Bearer ${await this.authService.getAccessToken(connectionId)}` };
  }

  async startSync(connectionId: string): Promise<void> {
    const status = this.getStatus(connectionId);
    if (status.syncing) return;
    status.syncing = true;
    try {
      await this.syncBases(connectionId);
      await this.syncCurrentUser(connectionId);
      status.lastSync = new Date().toISOString();
    } finally {
      status.syncing = false;
    }
  }

  private async syncBases(connectionId: string): Promise<void> {
    this.logger.log(`[${connectionId}] Syncing bases...`);
    const h = await this.headers(connectionId);
    let offset: string | undefined;
    const allBases: any[] = [];
    do {
      const params: Record<string, string> = {};
      if (offset) params.offset = offset;
      const { data } = await axios.get(`${AIRTABLE_BASE}/meta/bases`, { headers: h, params });
      allBases.push(...data.bases);
      offset = data.offset;
      if (offset) await sleep(DELAY_MS);
    } while (offset);

    for (const base of allBases) {
      await this.baseModel.updateOne(
        { airtableId: base.id, connectionId },
        { $set: { airtableId: base.id, connectionId, name: base.name, permissionLevel: base.permissionLevel, syncedAt: new Date() } },
        { upsert: true },
      );
    }
    const status = this.getStatus(connectionId);
    status.bases = allBases.length;
    this.logger.log(`[${connectionId}] Synced ${allBases.length} bases`);

    for (const base of allBases) {
      await this.syncTables(connectionId, base.id);
      await sleep(DELAY_MS);
    }
  }

  private async syncTables(connectionId: string, baseId: string): Promise<void> {
    const h = await this.headers(connectionId);
    const { data } = await axios.get(`${AIRTABLE_BASE}/meta/bases/${baseId}/tables`, { headers: h });
    const tables = data.tables ?? [];

    for (const table of tables) {
      await this.tableModel.updateOne(
        { airtableId: table.id, connectionId },
        { $set: { airtableId: table.id, connectionId, baseId, name: table.name, fields: table.fields ?? [], syncedAt: new Date() } },
        { upsert: true },
      );
    }
    const status = this.getStatus(connectionId);
    status.tables += tables.length;
    this.logger.log(`[${connectionId}] Synced ${tables.length} tables for base ${baseId}`);

    for (const table of tables) {
      await this.syncTickets(connectionId, baseId, table.id, table.name);
      await sleep(DELAY_MS);
    }
  }

  private async syncTickets(connectionId: string, baseId: string, tableId: string, tableName: string): Promise<void> {
    const h = await this.headers(connectionId);
    let offset: string | undefined;
    let count = 0;
    do {
      const params: Record<string, string> = { pageSize: '100' };
      if (offset) params.offset = offset;
      const { data } = await axios.get(`${AIRTABLE_BASE}/${baseId}/${tableId}`, { headers: h, params });
      const records: any[] = data.records ?? [];

      if (records.length > 0) {
        const ops = records.map(r => ({
          updateOne: {
            filter: { airtableId: r.id, connectionId },
            update: { $set: { airtableId: r.id, connectionId, baseId, tableId, tableName, fields: r.fields ?? {}, syncedAt: new Date() } },
            upsert: true,
          },
        }));
        await this.ticketModel.bulkWrite(ops);
        count += records.length;
      }

      offset = data.offset;
      if (offset) await sleep(DELAY_MS);
    } while (offset);

    const status = this.getStatus(connectionId);
    status.tickets += count;
    this.logger.log(`[${connectionId}] Synced ${count} tickets for table ${tableName}`);
  }

  private async syncCurrentUser(connectionId: string): Promise<void> {
    try {
      const h = await this.headers(connectionId);
      const { data } = await axios.get(`${AIRTABLE_BASE}/meta/whoami`, { headers: h });
      await this.userModel.updateOne(
        { airtableId: data.id, connectionId },
        { $set: { airtableId: data.id, connectionId, email: data.email ?? '', name: data.name ?? data.email ?? 'Unknown', syncedAt: new Date() } },
        { upsert: true },
      );
      this.getStatus(connectionId).users = 1;
    } catch (err) {
      this.logger.warn(`[${connectionId}] Could not sync user: ${(err as Error).message}`);
    }
  }

  getStatusForConnection(connectionId: string): SyncStatusEntry {
    return { ...this.getStatus(connectionId) };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

const INTERNAL_COLLECTIONS = new Set(['oauthtokens', 'system.views']);

@Injectable()
export class CollectionsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async listCollections(): Promise<{ name: string; count: number }[]> {
    const collections = await this.connection.db.listCollections().toArray();
    const results = await Promise.all(
      collections
        .filter(c => !c.name.startsWith('system.') && !INTERNAL_COLLECTIONS.has(c.name))
        .map(async c => ({
          name: c.name,
          count: await this.connection.db.collection(c.name).countDocuments({}),
        })),
    );
    return results;
  }

  async getCollectionData(
    name: string,
    page = 1,
    limit = 100,
    search = '',
    filterField = '',
    filterValue = '',
  ): Promise<{ data: Record<string, unknown>[]; total: number; fields: string[] }> {
    const collection = this.connection.db.collection(name);
    const skip = (page - 1) * limit;

    const baseFilter: Record<string, unknown> = {};
    if (filterField && filterValue) baseFilter[filterField] = filterValue;

    let query: Record<string, unknown>;
    if (search) {
      const searchOr = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { airtableId: { $regex: search, $options: 'i' } },
        ],
      };
      query = Object.keys(baseFilter).length ? { $and: [baseFilter, searchOr] } : searchOr;
    } else {
      query = baseFilter;
    }

    const [docs, total] = await Promise.all([
      collection.find(query).skip(skip).limit(limit).toArray() as Promise<Record<string, unknown>[]>,
      collection.countDocuments(query),
    ]);

    const data = name === 'tickets'
      ? docs.map(doc => {
          const nested = doc['fields'] as Record<string, unknown> | undefined;
          if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return doc;
          const { fields: _, ...rest } = doc;
          return { ...rest, ...nested };
        })
      : docs;

    const fields = this.extractFields(data);
    return { data, total, fields };
  }

  private extractFields(docs: Record<string, unknown>[]): string[] {
    const fieldSet = new Set<string>();
    for (const doc of docs.slice(0, 20)) {
      Object.keys(doc).forEach(k => {
        if (k !== '__v') fieldSet.add(k);
      });
    }
    return Array.from(fieldSet);
  }
}

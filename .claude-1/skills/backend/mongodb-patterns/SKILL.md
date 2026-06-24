# MongoDB Patterns — FSD Task

**Auto-invokes on:** MongoDB, Mongoose, collection, document, schema, upsert, aggregation, bulkWrite, index, dynamic collection

---

## Mongoose Connection (NestJS)

```typescript
// app.module.ts
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({ uri: process.env.MONGODB_URI }),
    }),
  ],
})
export class AppModule {}
```

---

## Schema Definitions

### Base Schema

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Base extends Document {
  @Prop({ required: true, unique: true }) airtableId: string;
  @Prop({ required: true }) name: string;
  @Prop() permissionLevel: string;
  @Prop() syncedAt: Date;
}
export const BaseSchema = SchemaFactory.createForClass(Base);
BaseSchema.index({ airtableId: 1 }, { unique: true });
```

### Table Schema

```typescript
@Schema({ timestamps: true })
export class Table extends Document {
  @Prop({ required: true, unique: true }) airtableId: string;
  @Prop({ required: true }) baseId: string;
  @Prop({ required: true }) name: string;
  @Prop({ type: [{ id: String, name: String, type: String }] }) fields: FieldDef[];
  @Prop() syncedAt: Date;
}
export const TableSchema = SchemaFactory.createForClass(Table);
TableSchema.index({ baseId: 1 });
```

### Ticket Schema (flexible — Airtable fields vary per table)

```typescript
@Schema({ timestamps: true, strict: false })  // strict: false allows arbitrary fields
export class Ticket extends Document {
  @Prop({ required: true, unique: true }) airtableId: string;
  @Prop({ required: true }) baseId: string;
  @Prop({ required: true }) tableId: string;
  @Prop({ type: Object }) fields: Record<string, any>;
  @Prop() syncedAt: Date;
}
export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.index({ baseId: 1, tableId: 1 });
TicketSchema.index({ airtableId: 1 }, { unique: true });
```

### Revision History Schema

```typescript
@Schema({ timestamps: true })
export class RevisionHistory extends Document {
  @Prop({ required: true, unique: true }) uuid: string;    // activityId
  @Prop({ required: true }) issueId: string;               // ticketId (airtableId)
  @Prop({ required: true }) columnType: string;            // 'Assignee' | 'Status'
  @Prop() oldValue: string;
  @Prop() newValue: string;
  @Prop() createdDate: Date;
  @Prop() authoredBy: string;                              // originatingUserId
}
export const RevisionHistorySchema = SchemaFactory.createForClass(RevisionHistory);
RevisionHistorySchema.index({ issueId: 1 });
RevisionHistorySchema.index({ uuid: 1 }, { unique: true });
```

---

## Upsert Pattern (sync without duplicates)

```typescript
// Single upsert
await this.ticketModel.updateOne(
  { airtableId: record.id },
  { $set: { ...record, syncedAt: new Date() } },
  { upsert: true }
);

// Bulk upsert (preferred for performance)
const ops = records.map(r => ({
  updateOne: {
    filter: { airtableId: r.airtableId },
    update: { $set: r },
    upsert: true,
  }
}));
await this.ticketModel.bulkWrite(ops, { ordered: false });
```

---

## Pagination (skip/limit with total count)

```typescript
async getRecords(collection: string, skip: number, limit: number, filter = {}, sort = {}) {
  const model = this.connection.model(collection);
  const [rows, totalCount] = await Promise.all([
    model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return { rows, totalCount };
}
```

---

## Dynamic Collection Access

For the AG Grid entity dropdown — access any collection by name at runtime.

```typescript
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class CollectionsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async listCollections(): Promise<string[]> {
    const collections = await this.connection.db.listCollections().toArray();
    return collections.map(c => c.name).filter(n => !n.startsWith('system.'));
  }

  async getCollectionRecords(name: string, skip = 0, limit = 50) {
    // Mongoose auto-creates a model for unknown collections
    const collection = this.connection.db.collection(name);
    const [rows, totalCount] = await Promise.all([
      collection.find({}).skip(skip).limit(limit).toArray(),
      collection.countDocuments(),
    ]);
    return { rows, totalCount };
  }

  async getCollectionFields(name: string): Promise<string[]> {
    const collection = this.connection.db.collection(name);
    const sample = await collection.findOne({});
    if (!sample) return [];
    return Object.keys(sample).filter(k => k !== '_id');
  }
}
```

---

## Indexes Strategy

```typescript
// Run once on application startup / migration
async function ensureIndexes(db: Db) {
  await db.collection('tickets').createIndex({ baseId: 1, tableId: 1 });
  await db.collection('tickets').createIndex({ airtableId: 1 }, { unique: true });
  await db.collection('revisionhistories').createIndex({ issueId: 1 });
  await db.collection('revisionhistories').createIndex({ uuid: 1 }, { unique: true });
  await db.collection('tables').createIndex({ baseId: 1 });
}
```

---

## Aggregation: Revision History Summary

```typescript
// Count assignee + status changes per ticket
const summary = await RevisionHistoryModel.aggregate([
  { $group: {
    _id: { issueId: '$issueId', columnType: '$columnType' },
    changeCount: { $sum: 1 },
    latestChange: { $max: '$createdDate' },
  }},
  { $sort: { latestChange: -1 } },
]);
```

---

## Environment

```
MONGODB_URI=mongodb://localhost:27017/airtable_integration
```

For production: use MongoDB Atlas connection string with `?retryWrites=true&w=majority`.

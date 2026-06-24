import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TableDocument = Table & Document;

@Schema({ timestamps: true })
export class Table {
  @Prop({ required: true }) airtableId: string;
  @Prop({ required: true }) baseId: string;
  @Prop({ required: true }) name: string;
  @Prop({ type: [Object] }) fields: { id: string; name: string; type: string }[];
  @Prop() syncedAt: Date;
}

export const TableSchema = SchemaFactory.createForClass(Table);
TableSchema.index({ airtableId: 1 }, { unique: true });

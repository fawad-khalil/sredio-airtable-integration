import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TicketDocument = Ticket & Document;

@Schema({ strict: false, timestamps: true })
export class Ticket {
  @Prop({ required: true, unique: true }) airtableId: string;
  @Prop({ required: true }) baseId: string;
  @Prop({ required: true }) tableId: string;
  @Prop() tableName: string;
  @Prop({ type: Object }) fields: Record<string, unknown>;
  @Prop() syncedAt: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

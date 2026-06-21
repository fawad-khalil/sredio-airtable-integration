import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TicketDocument = Ticket & Document;

@Schema({ strict: false, timestamps: true })
export class Ticket {
  @Prop({ required: true }) airtableId: string;
  @Prop({ required: true, index: true }) connectionId: string;
  @Prop({ required: true }) baseId: string;
  @Prop({ required: true }) tableId: string;
  @Prop() tableName: string;
  @Prop({ type: Object }) fields: Record<string, unknown>;
  @Prop() syncedAt: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.index({ airtableId: 1, connectionId: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BaseDocument = Base & Document;

@Schema({ timestamps: true })
export class Base {
  @Prop({ required: true }) airtableId: string;
  @Prop({ required: true, index: true }) connectionId: string;
  @Prop({ required: true }) name: string;
  @Prop() permissionLevel: string;
  @Prop() syncedAt: Date;
}

export const BaseSchema = SchemaFactory.createForClass(Base);
BaseSchema.index({ airtableId: 1, connectionId: 1 }, { unique: true });

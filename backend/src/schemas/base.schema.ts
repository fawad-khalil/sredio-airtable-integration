import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BaseDocument = Base & Document;

@Schema({ timestamps: true })
export class Base {
  @Prop({ required: true, unique: true }) airtableId: string;
  @Prop({ required: true }) name: string;
  @Prop() permissionLevel: string;
  @Prop() syncedAt: Date;
}

export const BaseSchema = SchemaFactory.createForClass(Base);

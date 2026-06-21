import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true }) airtableId: string;
  @Prop() email: string;
  @Prop() name: string;
  @Prop() syncedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

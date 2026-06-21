import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OAuthTokenDocument = OAuthToken & Document;

@Schema({ timestamps: true })
export class OAuthToken {
  @Prop({ required: true, unique: true }) connectionId: string;
  @Prop({ required: true }) accessToken: string;
  @Prop({ required: true }) refreshToken: string;
  @Prop() tokenType: string;
  @Prop() expiresIn: number;
  @Prop() scope: string;
  @Prop({ required: true }) tokenCreatedAt: number; // epoch ms from Airtable response
}

export const OAuthTokenSchema = SchemaFactory.createForClass(OAuthToken);

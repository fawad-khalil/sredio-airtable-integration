import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RevisionHistoryDocument = RevisionHistory & Document;

@Schema({ timestamps: true })
export class RevisionHistory {
  @Prop({ required: true }) uuid: string;
  @Prop({ required: true }) issueId: string;
  @Prop() columnType: string;
  @Prop() oldValue: string;
  @Prop() newValue: string;
  @Prop() createdDate: Date;
  @Prop() authoredBy: string;
  @Prop() syncedAt: Date;
}

export const RevisionHistorySchema = SchemaFactory.createForClass(RevisionHistory);
RevisionHistorySchema.index({ uuid: 1 }, { unique: true });

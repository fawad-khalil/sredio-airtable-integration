import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { AuthModule } from '../auth/auth.module';
import { Base, BaseSchema } from '../../schemas/base.schema';
import { Table, TableSchema } from '../../schemas/table.schema';
import { Ticket, TicketSchema } from '../../schemas/ticket.schema';
import { User, UserSchema } from '../../schemas/user.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Base.name, schema: BaseSchema },
      { name: Table.name, schema: TableSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}

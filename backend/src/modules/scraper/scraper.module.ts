import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScraperController } from './scraper.controller';
import { ScraperService } from './scraper.service';
import { Ticket, TicketSchema } from '../../schemas/ticket.schema';
import { RevisionHistory, RevisionHistorySchema } from '../../schemas/revision-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticket.name, schema: TicketSchema },
      { name: RevisionHistory.name, schema: RevisionHistorySchema },
    ]),
  ],
  controllers: [ScraperController],
  providers: [ScraperService],
})
export class ScraperModule {}

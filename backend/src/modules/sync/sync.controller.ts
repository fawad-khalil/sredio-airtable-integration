import { Controller, Post, Get, HttpCode } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('start')
  @HttpCode(202)
  start() {
    this.syncService.startSync().catch(err => console.error('Sync error:', err));
    return { message: 'Sync started' };
  }

  @Get('status')
  status() {
    return this.syncService.getStatus();
  }
}

import { Controller, Post, Get, Headers, HttpCode } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('start')
  @HttpCode(202)
  start(@Headers('x-connection-id') connectionId: string) {
    this.syncService.startSync(connectionId ?? '').catch(err => console.error('Sync error:', err));
    return { message: 'Sync started' };
  }

  @Get('status')
  status(@Headers('x-connection-id') connectionId: string) {
    return this.syncService.getStatusForConnection(connectionId ?? '');
  }
}

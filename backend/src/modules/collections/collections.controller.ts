import { Controller, Get, Param, Query, Headers } from '@nestjs/common';
import { CollectionsService } from './collections.service';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  list(@Headers('x-connection-id') connectionId: string) {
    return this.collectionsService.listCollections(connectionId ?? '');
  }

  @Get(':name')
  getCollection(
    @Param('name') name: string,
    @Headers('x-connection-id') connectionId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('search') search = '',
    @Query('filterField') filterField = '',
    @Query('filterValue') filterValue = '',
  ) {
    return this.collectionsService.getCollectionData(
      name, parseInt(page), parseInt(limit), search, connectionId ?? '', filterField, filterValue,
    );
  }
}

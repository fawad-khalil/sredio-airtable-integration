import { Controller, Get, Param, Query } from '@nestjs/common';
import { CollectionsService } from './collections.service';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  list() {
    return this.collectionsService.listCollections();
  }

  @Get(':name')
  getCollection(
    @Param('name') name: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('search') search = '',
    @Query('filterField') filterField = '',
    @Query('filterValue') filterValue = '',
  ) {
    return this.collectionsService.getCollectionData(
      name, parseInt(page), parseInt(limit), search, filterField, filterValue,
    );
  }
}

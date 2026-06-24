# AG Grid Patterns — FSD Task

**Auto-invokes on:** AG Grid, AG Charts, dynamic columns, ColDef, filter, sort, server-side row model, gridApi, setQuickFilter, AgGridAngular

---

## Setup in Angular (Standalone)

```typescript
// app.config.ts — register AG Grid modules
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
ModuleRegistry.registerModules([AllCommunityModule]);
```

```typescript
import { Component, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';

@Component({
  standalone: true,
  imports: [AgGridAngular],
  template: `
    <ag-grid-angular
      style="width: 100%; height: 600px;"
      [rowData]="rowData()"
      [columnDefs]="colDefs()"
      [defaultColDef]="defaultColDef"
      (gridReady)="onGridReady($event)"
    />
  `
})
export class DataGridComponent {
  private gridApi!: GridApi;
  readonly rowData = signal<any[]>([]);
  readonly colDefs = signal<ColDef[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100,
  };

  onGridReady(event: GridReadyEvent) {
    this.gridApi = event.api;
  }
}
```

---

## Dynamic Column Generation

Always derive columns from the data — never hardcode for Airtable collections.

```typescript
function buildColDefs(fieldNames: string[]): ColDef[] {
  return fieldNames.map(field => ({
    field,
    headerName: toHeaderName(field),   // 'createdDate' → 'Created Date'
    sortable: true,
    filter: true,
    resizable: true,
  }));
}

function toHeaderName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}
```

Usage — call after loading collection schema:

```typescript
this.collectionService.getFields(collectionName).subscribe(fields => {
  this.colDefs.set(buildColDefs(fields));
});
```

---

## Quick Search (Client-Side)

Wire a search input to AG Grid's built-in quick filter:

```typescript
onSearchChange(value: string) {
  this.gridApi.setGridOption('quickFilterText', value);
}
```

```html
<mat-form-field appearance="outline">
  <mat-label>Search</mat-label>
  <input matInput (input)="onSearchChange($any($event.target).value)" />
  <mat-icon matSuffix>search</mat-icon>
</mat-form-field>
```

---

## Server-Side Filtering + Sorting

Use when dataset is large (>10k records). Implement `IServerSideDatasource`:

```typescript
import { IServerSideDatasource, IServerSideGetRowsParams } from 'ag-grid-community';

function buildServerDatasource(service: CollectionService, collection: string): IServerSideDatasource {
  return {
    getRows(params: IServerSideGetRowsParams) {
      const { startRow, endRow, sortModel, filterModel } = params.request;
      service.getRecords(collection, { startRow, endRow, sortModel, filterModel })
        .subscribe({
          next: ({ rows, totalCount }) => params.success({ rowData: rows, rowCount: totalCount }),
          error: () => params.fail(),
        });
    }
  };
}
```

Enable in component:

```typescript
readonly rowModelType = 'serverSide' as const;

onGridReady(event: GridReadyEvent) {
  this.gridApi = event.api;
  this.gridApi.setGridOption('serverSideDatasource', buildServerDatasource(this.service, this.collection));
}
```

---

## Filter Model → MongoDB Query Translation

```typescript
// backend: translate AG Grid filterModel to MongoDB filter
function agFilterToMongoFilter(filterModel: Record<string, any>): Record<string, any> {
  const mongoFilter: Record<string, any> = {};
  for (const [field, filter] of Object.entries(filterModel)) {
    if (filter.filterType === 'text') {
      mongoFilter[field] = { $regex: filter.filter, $options: 'i' };
    } else if (filter.filterType === 'number') {
      if (filter.type === 'equals') mongoFilter[field] = filter.filter;
      if (filter.type === 'greaterThan') mongoFilter[field] = { $gt: filter.filter };
      if (filter.type === 'lessThan') mongoFilter[field] = { $lt: filter.filter };
    }
  }
  return mongoFilter;
}
```

---

## Sort Model → MongoDB Sort Translation

```typescript
function agSortToMongoSort(sortModel: { colId: string; sort: 'asc' | 'desc' }[]): Record<string, 1 | -1> {
  return sortModel.reduce((acc, { colId, sort }) => {
    acc[colId] = sort === 'asc' ? 1 : -1;
    return acc;
  }, {} as Record<string, 1 | -1>);
}
```

---

## AG Grid Theme (Angular Material style)

```typescript
import { themeQuartz } from 'ag-grid-community';

// In component:
readonly theme = themeQuartz.withParams({
  accentColor: '#3f51b5',       // Angular Material indigo
  headerBackgroundColor: '#f5f5f5',
  oddRowBackgroundColor: '#fafafa',
});
```

```html
<ag-grid-angular [theme]="theme" ... />
```

---

## Column Types for Airtable Fields

```typescript
function getColDefForFieldType(fieldName: string, fieldType: string): ColDef {
  const base: ColDef = { field: fieldName, headerName: toHeaderName(fieldName) };

  switch (fieldType) {
    case 'date':
    case 'dateTime':
      return { ...base, filter: 'agDateColumnFilter', valueFormatter: p => p.value ? new Date(p.value).toLocaleDateString() : '' };
    case 'number':
    case 'currency':
      return { ...base, filter: 'agNumberColumnFilter', type: 'numericColumn' };
    case 'checkbox':
      return { ...base, cellRenderer: (p: any) => p.value ? '✓' : '' };
    default:
      return { ...base, filter: 'agTextColumnFilter' };
  }
}
```

---

## AG Charts (Basic Bar Chart)

```typescript
import { AgCharts } from 'ag-charts-angular';
import { AgChartOptions } from 'ag-charts-community';

readonly chartOptions = signal<AgChartOptions>({
  data: [],
  series: [{ type: 'bar', xKey: 'label', yKey: 'count' }],
});
```

```html
<ag-charts [options]="chartOptions()" style="height: 300px;" />
```

---

## Pagination Controls

```typescript
// Use AG Grid built-in pagination (client-side)
readonly pagination = true;
readonly paginationPageSize = 50;
readonly paginationPageSizeSelector = [25, 50, 100];
```

```html
<ag-grid-angular
  [pagination]="pagination"
  [paginationPageSize]="paginationPageSize"
  [paginationPageSizeSelector]="paginationPageSizeSelector"
  ...
/>
```

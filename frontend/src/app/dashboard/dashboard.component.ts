import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  ModuleRegistry,
  AllCommunityModule,
  RowClickedEvent,
} from 'ag-grid-community';
import { Subject, Subscription, interval } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  takeUntil,
} from 'rxjs/operators';
import {
  ApiService,
  Collection,
  SyncStatus,
  ScraperStatus,
} from '../services/api.service';
import { RecordDetailDialogComponent } from './record-detail-dialog.component';

interface BreadcrumbItem {
  label: string;
  collection: string;
  filter: { field: string; value: string } | null;
}

ModuleRegistry.registerModules([AllCommunityModule]);

function toHeaderName(field: string): string {
  return field
    .replace(/^_+/, '')
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

const COLLECTION_SKIP: Record<string, string[]> = {
  bases: ['permissionLevel'],
  tables: ['fields'],
  users: ['name'],
};

function buildColDefs(fields: string[], extraSkip: string[] = []): ColDef[] {
  const skip = new Set(['__v', '_id', 'baseId', 'tableId', 'airtableId', 'createdAt', 'updatedAt', ...extraSkip]);
  return fields
    .filter((f) => !skip.has(f))
    .map((field) => ({
      field,
      headerName: toHeaderName(field),
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 100,
      flex: 1,
      tooltipValueGetter: (p: any) => {
        const v = p.value;
        return typeof v === 'object' && v !== null
          ? JSON.stringify(v)
          : String(v ?? '');
      },
      valueFormatter: (p: any) => {
        const v = p.value;
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      },
    }));
}

function formatTicketDate(val: unknown): string {
  if (typeof val !== 'string') return String(val ?? '—');
  const d = new Date(val);
  return /^\d{4}-\d{2}-\d{2}T/.test(val) && !isNaN(d.getTime())
    ? d.toLocaleString() : (val || '—');
}

function buildTicketColDefs(): ColDef[] {
  return [
    {
      colId: 'nameTitle',
      headerName: 'Name / Title',
      sortable: true,
      filter: true,
      resizable: true,
      flex: 2,
      minWidth: 180,
      valueGetter: (p: any) =>
        p.data?.['Name'] ?? p.data?.['Title'] ?? p.data?.['Summary'] ?? '—',
      cellRenderer: (p: any) => {
        const tn = String(p.data?.tableName ?? '').toLowerCase();
        const color = tn.includes('bug') ? '#d32f2f'
          : tn.includes('task') ? '#1565c0' : 'transparent';
        const name = String(p.value ?? '—');
        return `<span style="display:flex;align-items:center;gap:8px;height:100%">` +
          `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>` +
          `<span>${name}</span></span>`;
      },
    },
    {
      colId: 'prioritySeverity',
      headerName: 'Priority / Severity',
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      minWidth: 140,
      valueGetter: (p: any) => p.data?.['Priority'] ?? p.data?.['Severity'] ?? '—',
      valueFormatter: (p: any) => String(p.value ?? '—'),
    },
    {
      colId: 'assignee',
      headerName: 'Assignee',
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      minWidth: 140,
      valueGetter: (p: any) => {
        const v = p.data?.['Assignee'];
        if (typeof v !== 'object' || v === null) return String(v ?? '');
        return String((v as any)['name'] ?? (v as any)['email'] ?? '');
      },
      valueFormatter: (p: any) => (p.value as string) || '—',
    },
    {
      field: 'Status',
      headerName: 'Status',
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      minWidth: 100,
      valueFormatter: (p: any) => String(p.value ?? '—'),
    },
    {
      colId: 'createdAt',
      headerName: 'Created At',
      sortable: true,
      filter: 'agDateColumnFilter',
      filterParams: {
        comparator: (filterDate: Date, cellValue: string | null) => {
          if (!cellValue) return -1;
          const d = new Date(cellValue);
          if (isNaN(d.getTime())) return -1;
          const cell = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const filt = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
          return cell < filt ? -1 : cell > filt ? 1 : 0;
        },
      },
      resizable: true,
      flex: 1,
      minWidth: 160,
      valueGetter: (p: any) => p.data?.['Created Time'] ?? p.data?.['Created Date'] ?? null,
      valueFormatter: (p: any) => formatTicketDate(p.value),
    },
    {
      colId: 'updatedAt',
      headerName: 'Updated At',
      sortable: true,
      filter: 'agDateColumnFilter',
      filterParams: {
        comparator: (filterDate: Date, cellValue: string | null) => {
          if (!cellValue) return -1;
          const d = new Date(cellValue);
          if (isNaN(d.getTime())) return -1;
          const cell = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          const filt = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
          return cell < filt ? -1 : cell > filt ? 1 : 0;
        },
      },
      resizable: true,
      flex: 1,
      minWidth: 160,
      valueGetter: (p: any) => p.data?.['Last Modified Time'] ?? p.data?.['Updated At'] ?? null,
      valueFormatter: (p: any) => formatTicketDate(p.value),
    },
  ];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatCardModule,
    MatDividerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
    AgGridAngular,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Signals
  connected = signal(false);
  collections = signal<Collection[]>([]);
  selectedCollection = signal<string>('');
  colDefs = signal<ColDef[]>([]);
  rowData = signal<Record<string, unknown>[]>([]);
  loading = signal(false);
  totalRecords = signal(0);
  currentPage = signal(1);
  pageSize = signal(100);
  showSyncPanel = signal(false);
  syncStatus = signal<SyncStatus | null>(null);
  scraperStatus = signal<ScraperStatus | null>(null);
  mfaCode = signal('');
  cookieString = signal('');
  breadcrumb = signal<BreadcrumbItem[]>([]);
  activeFilter = signal<{ field: string; value: string } | null>(null);

  integrations = ['Airtable'];
  selectedIntegration = 'Airtable';
  searchControl = new FormControl('');

  private gridApi!: GridApi;
  private destroy$ = new Subject<void>();
  private scraperPoll?: Subscription;
  private syncPoll?: Subscription;

  rowStyleFn = (params: any): Record<string, string> => {
    const vals = Object.values(params.data ?? {});
    if (vals.some(v => typeof v === 'string' && v.toLowerCase() === 'bug'))
      return { background: '#fff3e0', borderLeft: '3px solid #ef6c00' };
    if (vals.some(v => typeof v === 'string' && v.toLowerCase() === 'task'))
      return { background: '#e3f2fd', borderLeft: '3px solid #1976d2' };
    return {};
  };

  constructor(
    private readonly apiService: ApiService,
    private readonly snackBar: MatSnackBar,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['connected'] === 'true') {
        this.router.navigate([], { queryParams: {} });
        this.snackBar.open('Successfully connected to Airtable!', 'Close', { duration: 4000 });
      } else if (params['error'] === 'auth_cancelled') {
        this.router.navigate([], { queryParams: {} });
        this.snackBar.open('Airtable connection cancelled.', 'Close', { duration: 3000 });
      } else if (params['error'] === 'auth_failed') {
        this.router.navigate([], { queryParams: {} });
        this.snackBar.open('Airtable connection failed. Please try again.', 'Close', { duration: 4000 });
      }
    });

    this.apiService.getAuthStatus().subscribe({
      next: (s) => {
        this.connected.set(s.connected);
        if (s.connected) this.loadCollections();
      },
      error: () => this.connected.set(false),
    });

    this.apiService
      .getSyncStatus()
      .subscribe({ next: (s) => this.syncStatus.set(s), error: () => {} });
    this.apiService
      .getScraperStatus()
      .subscribe({ next: (s) => this.scraperStatus.set(s), error: () => {} });

    // Search debounce
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((value) => {
        if (this.gridApi) {
          this.gridApi.setGridOption('quickFilterText', value ?? '');
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopPolling();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
  }

  loadCollections(): void {
    this.apiService.getCollections().subscribe({
      next: (cols) => this.collections.set(cols),
      error: () =>
        this.snackBar.open('Failed to load collections', 'Close', {
          duration: 3000,
        }),
    });
  }

  onCollectionChange(name: string): void {
    this.breadcrumb.set([]);
    this.activeFilter.set(null);
    this.selectedCollection.set(name);
    this.currentPage.set(1);
    this.loadCollectionData();
  }

  loadCollectionData(): void {
    const name = this.selectedCollection();
    if (!name) return;

    this.loading.set(true);
    const filter = this.activeFilter();
    this.apiService
      .getCollectionData(name, {
        page: this.currentPage(),
        limit: this.pageSize(),
        search: this.searchControl.value ?? '',
        filterField: filter?.field,
        filterValue: filter?.value,
      })
      .subscribe({
        next: (result) => {
          this.colDefs.set(name === 'tickets' ? buildTicketColDefs() : buildColDefs(result.fields, COLLECTION_SKIP[name] ?? []));
          this.rowData.set(result.data);
          this.totalRecords.set(result.total);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snackBar.open('Failed to load collection data', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  get totalPages(): number {
    return Math.ceil(this.totalRecords() / this.pageSize());
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
      this.loadCollectionData();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages) {
      this.currentPage.update((p) => p + 1);
      this.loadCollectionData();
    }
  }

  connectAirtable(): void {
    window.location.href = `${environment.apiUrl}/auth/airtable/connect`;
  }

  startSync(): void {
    this.apiService.startSync().subscribe({
      next: () => {
        this.snackBar.open('Sync started!', 'Close', { duration: 2000 });
        this.startSyncPolling();
      },
      error: () =>
        this.snackBar.open('Failed to start sync', 'Close', { duration: 3000 }),
    });
  }

  private startSyncPolling(): void {
    this.syncPoll?.unsubscribe();
    this.syncPoll = interval(3000)
      .pipe(
        switchMap(() => this.apiService.getSyncStatus()),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (s) => {
          this.syncStatus.set(s);
          if (!s.syncing) {
            this.syncPoll?.unsubscribe();
            if (s.lastSync) this.loadCollections();
          }
        },
      });
  }

  startScraper(): void {
    this.apiService.startScraper().subscribe({
      next: () => {
        this.snackBar.open('Scraper started!', 'Close', { duration: 2000 });
        this.startScraperPolling();
      },
      error: () =>
        this.snackBar.open('Failed to start scraper', 'Close', {
          duration: 3000,
        }),
    });
  }

  private startScraperPolling(): void {
    this.scraperPoll?.unsubscribe();
    this.scraperPoll = interval(3000)
      .pipe(
        switchMap(() => this.apiService.getScraperStatus()),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (s) => {
          this.scraperStatus.set(s);
          if (s.state === 'complete' || s.state === 'error') {
            this.scraperPoll?.unsubscribe();
          }
        },
      });
  }

  submitCookies(): void {
    const cookies = this.cookieString();
    if (!cookies) return;
    this.apiService.setCookies(cookies).subscribe({
      next: () => {
        this.cookieString.set('');
        this.snackBar.open(
          'Cookies saved! You can now start scraping.',
          'Close',
          { duration: 3000 },
        );
        this.apiService.getScraperStatus().subscribe({
          next: (s) => this.scraperStatus.set(s),
          error: () => {},
        });
      },
      error: () =>
        this.snackBar.open('Failed to save cookies', 'Close', {
          duration: 3000,
        }),
    });
  }

  submitMfa(): void {
    const code = this.mfaCode();
    if (!code) return;
    this.apiService.submitMfaCode(code).subscribe({
      next: () => {
        this.mfaCode.set('');
        this.snackBar.open('MFA code submitted!', 'Close', { duration: 2000 });
      },
      error: () =>
        this.snackBar.open('Failed to submit MFA code', 'Close', {
          duration: 3000,
        }),
    });
  }

  onRowClicked(event: RowClickedEvent): void {
    const row = event.data as Record<string, unknown>;
    const col = this.selectedCollection();

    if (col === 'bases') {
      this.drillDown('tables', { field: 'baseId', value: row['airtableId'] as string }, (row['name'] as string) ?? 'Base');
    } else if (col === 'tables') {
      this.drillDown('tickets', { field: 'tableId', value: row['airtableId'] as string }, (row['name'] as string) ?? 'Table');
    } else {
      this.dialog.open(RecordDetailDialogComponent, {
        data: { record: row, collection: col },
        width: '600px',
        maxHeight: '80vh',
      });
    }
  }

  private drillDown(next: string, filter: { field: string; value: string }, label: string): void {
    this.breadcrumb.update(bc => [...bc, { label, collection: this.selectedCollection(), filter: this.activeFilter() }]);
    this.activeFilter.set(filter);
    this.selectedCollection.set(next);
    this.currentPage.set(1);
    this.loadCollectionData();
  }

  navigateToBreadcrumb(index: number): void {
    const item = this.breadcrumb()[index];
    this.breadcrumb.update(bc => bc.slice(0, index));
    this.selectedCollection.set(item.collection);
    this.activeFilter.set(item.filter);
    this.currentPage.set(1);
    this.loadCollectionData();
  }

  formatCollection(name: string): string {
    const map: Record<string, string> = {
      bases: 'Bases', tables: 'Tables', tickets: 'Tickets',
      users: 'Users', revisionhistories: 'Revision History',
    };
    return map[name] ?? (name.charAt(0).toUpperCase() + name.slice(1));
  }

  private stopPolling(): void {
    this.scraperPoll?.unsubscribe();
    this.syncPoll?.unsubscribe();
  }
}

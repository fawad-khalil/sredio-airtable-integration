import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
import { ScraperLoginDialogComponent, ScraperLoginResult } from './scraper-login-dialog.component';
import { MfaDialogComponent } from './mfa-dialog.component';
import { SyncPanelComponent } from './sync-panel.component';
import { ChartsPanelComponent } from './charts-panel.component';
import { STATUS_COLORS } from './status-colors';

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

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

function statusCellRenderer(params: any): string {
  const v = params.value;
  if (v === null || v === undefined || v === '') return '';
  const c = STATUS_COLORS[String(v).toLowerCase()] ?? { bg: '#eceff1', fg: '#37474f' };
  return (
    `<span style="display:inline-block;padding:2px 10px;border-radius:12px;` +
    `font-size:0.75rem;font-weight:600;line-height:1.6;` +
    `background:${c.bg};color:${c.fg};">${escapeHtml(String(v))}</span>`
  );
}

function buildColDefs(fields: string[]): ColDef[] {
  // Show airtableId + all Airtable fields; hide Mongo internals only.
  const skip = new Set(['_id', '__v', 'baseId', 'tableId', 'createdAt', 'updatedAt', 'syncedAt']);
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
      ...(field === 'Status' ? { cellRenderer: statusCellRenderer } : {}),
      tooltipValueGetter: (p: { value?: any }) => {
        const v = p.value;
        return typeof v === 'object' && v !== null
          ? JSON.stringify(v)
          : String(v ?? '');
      },
      valueFormatter: (p: { value?: any }) => {
        const v = p.value;
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      },
    }));
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MatDialogModule,
    AgGridAngular,
    // MfaDialogComponent,
    SyncPanelComponent,
    ChartsPanelComponent,
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
  viewMode = signal<'table' | 'charts'>('table');
  syncStatus = signal<SyncStatus | null>(null);
  scraperStatus = signal<ScraperStatus | null>(null);
  loginMethod = signal<'credentials' | 'browser'>('credentials');

  // Proxy for the sync panel's two-way [(loginMethod)] binding over the signal.
  get loginMethodValue(): 'credentials' | 'browser' {
    return this.loginMethod();
  }
  set loginMethodValue(value: 'credentials' | 'browser') {
    this.loginMethod.set(value);
  }
  breadcrumb = signal<BreadcrumbItem[]>([]);
  activeFilter = signal<{ field: string; value: string } | null>(null);

  integrations = ['Airtable'];
  selectedIntegration = 'Airtable';
  searchControl = new FormControl('');

  private gridApi!: GridApi;
  private destroy$ = new Subject<void>();
  private scraperPoll?: Subscription;
  private syncPoll?: Subscription;
  private mfaDialogRef: MatDialogRef<MfaDialogComponent> | null = null;
  private mfaPromptSeen = 0;

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
        if (params['connectionId']) {
          localStorage.setItem('connectionId', params['connectionId']);
        }
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
    this.mfaDialogRef?.close();
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
          this.colDefs.set(buildColDefs(result.fields));
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

  get rangeStart(): number {
    return this.totalRecords() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.currentPage() * this.pageSize(), this.totalRecords());
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
    window.location.href = `${import.meta.env['NG_APP_API_URL']}/auth/airtable/connect`;
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
            if (s.lastSync) {
              this.loadCollections();
              if (this.selectedCollection()) this.loadCollectionData();
            }
          }
        },
        error: () => {},
      });
  }

  startScraper(): void {
    if (this.loginMethod() === 'credentials') {
      this.dialog
        .open(ScraperLoginDialogComponent, { width: '400px' })
        .afterClosed()
        .subscribe((creds: ScraperLoginResult | undefined) => {
          if (!creds) return; // cancelled
          this.runScraper({ method: 'credentials', email: creds.email, password: creds.password });
        });
    } else {
      this.runScraper({ method: 'browser' });
    }
  }

  private runScraper(payload: { method: string; email?: string; password?: string }): void {
    this.apiService.startScraper(payload).subscribe({
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

          if (s.state === 'awaiting_mfa' && !this.mfaDialogRef) {
            this.mfaPromptSeen = s.mfaPrompts ?? 1;
            this.mfaDialogRef = this.dialog.open(MfaDialogComponent, {
              width: '400px',
              disableClose: true,
            });
            this.mfaDialogRef.afterClosed().subscribe(() => {
              this.mfaDialogRef = null;
            });
          } else if (s.state === 'awaiting_mfa' && this.mfaDialogRef && (s.mfaPrompts ?? 1) > this.mfaPromptSeen) {
            // Backend re-prompted → the previously submitted code was rejected.
            this.mfaPromptSeen = s.mfaPrompts ?? 1;
            this.mfaDialogRef.componentInstance?.markRejected();
          }

          if (s.state !== 'awaiting_mfa' && this.mfaDialogRef) {
            this.mfaDialogRef.close();
          }

          if (s.state === 'complete' || s.state === 'error') {
            this.scraperPoll?.unsubscribe();
            if (s.state === 'error') {
              this.snackBar.open(s.message || 'Scraper failed', 'Close', { duration: 6000 });
            } else {
              this.snackBar.open(s.message || 'Scrape complete', 'Close', { duration: 4000 });
            }
          }
        },
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
      users: 'Users', revisionhistories: 'Revision Histories',
    };
    return map[name] ?? (name.charAt(0).toUpperCase() + name.slice(1));
  }

  private stopPolling(): void {
    this.scraperPoll?.unsubscribe();
    this.syncPoll?.unsubscribe();
  }
}

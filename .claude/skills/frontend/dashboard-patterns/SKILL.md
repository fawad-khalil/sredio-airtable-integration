---
name: dashboard-patterns
description: Angular + AG Grid dashboard patterns for the FSD Airtable Integration Dashboard. Covers integration dropdown, entity/collection dropdown, dynamic AG Grid column layout, search bar, Angular Material card/toolbar layout, and data loading states.
allowed-tools: Read, Grep
---

# Dashboard Patterns — FSD Task

**Auto-invokes on:** dashboard, dashboard layout, integration dropdown, entity dropdown, collection picker, search bar, Angular Material card, toolbar, loading state, empty state

---

## Main Dashboard Layout

```
┌─────────────────────────────────────────────────────────┐
│  Toolbar: [Logo]  [Integration: Airtable ▼]  [Sync btn] │
├───────────┬─────────────────────────────────────────────┤
│  Sidebar  │  [Search input]           [Filter icon]     │
│           │  ─────────────────────────────────────────  │
│ Entity:   │                                             │
│ [bases ▼] │         AG Grid Table                       │
│           │     (dynamic columns from collection)       │
│  [Sync    │                                             │
│  Status]  │                                             │
└───────────┴─────────────────────────────────────────────┘
```

---

## Layout Component

```html
<!-- app-shell.component.html -->
<mat-toolbar color="primary">
  <mat-icon>table_chart</mat-icon>
  <span class="title">Airtable Dashboard</span>
  <span class="spacer"></span>

  <!-- Integration dropdown -->
  <mat-form-field appearance="outline" class="toolbar-field">
    <mat-label>Integration</mat-label>
    <mat-select [(ngModel)]="selectedIntegration">
      <mat-option value="airtable">Airtable</mat-option>
    </mat-select>
  </mat-form-field>

  <button mat-raised-button (click)="triggerSync()" [disabled]="syncing()">
    <mat-icon>sync</mat-icon>
    {{ syncing() ? 'Syncing...' : 'Sync' }}
  </button>
</mat-toolbar>

<mat-sidenav-container class="container">
  <mat-sidenav mode="side" opened>
    <!-- Entity/collection dropdown -->
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>Entity</mat-label>
      <mat-select [formControl]="collectionCtrl">
        <mat-option *ngFor="let col of collections()" [value]="col">
          {{ col }}
        </mat-option>
      </mat-select>
    </mat-form-field>

    <!-- Sync status card -->
    <mat-card class="status-card">
      <mat-card-subtitle>Last Sync</mat-card-subtitle>
      <mat-card-content>{{ lastSyncTime() || 'Never' }}</mat-card-content>
    </mat-card>
  </mat-sidenav>

  <mat-sidenav-content>
    <router-outlet />
  </mat-sidenav-content>
</mat-sidenav-container>
```

```css
.title { margin-left: 8px; font-size: 1.2rem; }
.spacer { flex: 1 1 auto; }
.toolbar-field { margin-top: 16px; margin-right: 12px; width: 180px; }
mat-sidenav { width: 220px; padding: 16px; }
.full-width { width: 100%; }
.status-card { margin-top: 16px; background: #f5f5f5; }
.container { height: calc(100vh - 64px); }
```

---

## Search Bar

```html
<!-- Inside dashboard page, above the grid -->
<div class="toolbar-row">
  <mat-form-field appearance="outline" class="search-field">
    <mat-label>Search</mat-label>
    <input matInput (input)="onSearch($any($event.target).value)" placeholder="Search records..." />
    <mat-icon matSuffix>search</mat-icon>
  </mat-form-field>

  <button mat-icon-button (click)="clearSearch()" *ngIf="searchTerm()">
    <mat-icon>clear</mat-icon>
  </button>
</div>
```

```typescript
readonly searchTerm = signal('');

onSearch(value: string) {
  this.searchTerm.set(value);
  this.gridApi?.setGridOption('quickFilterText', value);
}

clearSearch() {
  this.searchTerm.set('');
  this.gridApi?.setGridOption('quickFilterText', '');
}
```

---

## Loading State

```html
<div *ngIf="loading()" class="loading-overlay">
  <mat-spinner diameter="48" />
  <p>Loading records...</p>
</div>

<ag-grid-angular
  *ngIf="!loading()"
  [rowData]="rowData()"
  [columnDefs]="colDefs()"
  ...
/>
```

```typescript
readonly loading = signal(false);

loadCollection(name: string) {
  this.loading.set(true);
  this.collectionService.getRecords(name)
    .pipe(finalize(() => this.loading.set(false)))
    .subscribe(data => {
      this.rowData.set(data.rows);
      this.colDefs.set(buildColDefs(data.fields));
    });
}
```

---

## Empty State

```html
<div *ngIf="!loading() && rowData().length === 0" class="empty-state">
  <mat-icon class="empty-icon">inbox</mat-icon>
  <h3>No records found</h3>
  <p>Select a collection from the sidebar or run a sync to load data.</p>
  <button mat-raised-button color="primary" (click)="triggerSync()">
    <mat-icon>sync</mat-icon> Sync Now
  </button>
</div>
```

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: #757575;
}
.empty-icon { font-size: 64px; height: 64px; width: 64px; margin-bottom: 16px; }
```

---

## Scraper Status / MFA Card

Show when scraper state is `awaiting_mfa`:

```html
<mat-card *ngIf="scraperStatus()?.state === 'awaiting_mfa'" class="mfa-card">
  <mat-card-header>
    <mat-card-title>Two-Factor Authentication Required</mat-card-title>
    <mat-card-subtitle>Enter the code from your authenticator app</mat-card-subtitle>
  </mat-card-header>
  <mat-card-content>
    <form [formGroup]="mfaForm" (ngSubmit)="submitMfa()">
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>MFA Code</mat-label>
        <input matInput formControlName="mfaCode" maxlength="6" placeholder="000000" />
      </mat-form-field>
      <button mat-raised-button color="primary" type="submit" [disabled]="mfaForm.invalid">
        Submit Code
      </button>
    </form>
  </mat-card-content>
</mat-card>
```

---

## Collection Switcher Logic

When the collection dropdown changes, reload columns + data:

```typescript
constructor() {
  effect(() => {
    const collection = this.collectionCtrl.value;
    if (collection) this.loadCollection(collection);
  });
}

loadCollection(name: string) {
  this.loading.set(true);
  this.collectionService.getFields(name).pipe(
    switchMap(fields => {
      this.colDefs.set(buildColDefs(fields));
      return this.collectionService.getRecords(name, 0, 100);
    }),
    finalize(() => this.loading.set(false)),
  ).subscribe(({ rows }) => this.rowData.set(rows));
}
```

---

## Responsive Breakpoints

```css
@media (max-width: 768px) {
  mat-sidenav-container { flex-direction: column; }
  mat-sidenav { width: 100%; height: auto; }
  .toolbar-field { display: none; }  /* hide integration dropdown on mobile */
}
```

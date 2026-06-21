import { Component, OnInit, Inject, signal, computed } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from '../services/api.service';

export interface RecordDetailData {
  record: Record<string, unknown>;
  collection: string;
  fromDialog?: boolean;
}

const LABEL_MAP: Record<string, string> = {
  airtableId: 'Airtable ID',
  baseId: 'Base ID',
  tableId: 'Table ID',
  tableName: 'Table Name',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
  syncedAt: 'Synced At',
  issueId: 'Issue ID',
  columnType: 'Column Type',
  oldValue: 'Old Value',
  newValue: 'New Value',
  createdDate: 'Created Date',
  authoredBy: 'Authored By',
  uuid: 'UUID',
  permissionLevel: 'Permission Level',
  email: 'Email',
};

function toLabel(key: string): string {
  return LABEL_MAP[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

const NAME_FIELDS = ['Name', 'name', 'Title', 'title', 'Subject', 'subject', 'Summary', 'summary'];

// Local Mongoose timestamps + internal fields always hidden from display
const ALWAYS_SKIP = new Set([
  '_id', '__v', 'baseId', 'tableId', 'airtableId', 'tableName', 'email',
  'createdAt', 'updatedAt', 'syncedAt',
]);

const BUG_PRE_ORDER = ['Severity', 'Assignee', 'Status', 'Notes', 'AI Root Cause'];
const BUG_POST_ORDER = ['Created Date', 'Updated At'];
const TASK_PRE_ORDER = ['Description', 'Priority', 'Assignee', 'Status', 'Due Date'];
const TASK_POST_ORDER = ['Created Time', 'Last Modified Time'];
const TASK_SPECIAL = new Set(['Related Bugs', 'Tags', 'AI Summary']);

// Airtable returns linked records as string arrays ["recXXX"] in API v0
function extractLinkedId(val: unknown): string | null {
  if (!Array.isArray(val) || val.length === 0) return null;
  const first = val[0];
  if (typeof first === 'string') return first;
  if (typeof first === 'object' && first !== null) return (first as { id?: string }).id ?? null;
  return null;
}

function extractLinkedIds(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map(v => {
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && v !== null) return (v as { id?: string }).id ?? null;
      return null;
    })
    .filter((id): id is string => id !== null);
}

function resolveDisplayName(rec: Record<string, unknown>): string {
  const f = NAME_FIELDS.find(k => rec[k] != null && String(rec[k]).trim() !== '');
  return f ? String(rec[f]) : String(rec['airtableId'] ?? 'Record');
}

// Compute Synced At as max(local createdAt, updatedAt)
function computeSyncedAt(record: Record<string, unknown>): string {
  const a = record['createdAt'] ? new Date(record['createdAt'] as string) : null;
  const b = record['updatedAt'] ? new Date(record['updatedAt'] as string) : null;
  if (!a && !b) return '—';
  const d = !a ? b! : !b ? a : b > a ? b : a;
  return d.toLocaleString();
}

// Format Airtable AI Root Cause field: { state, value, isStale } → "State: text (Active|Stale)"
function formatAiField(val: unknown): string | null {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return null;
  const obj = val as Record<string, unknown>;
  if (!('state' in obj)) return null;
  const state = String(obj['state'] ?? '');
  const text = String(obj['value'] ?? '');
  const staleness = obj['isStale'] === true ? 'Stale' : 'Active';
  const capitalized = state.charAt(0).toUpperCase() + state.slice(1);
  return `${capitalized}: ${text} (${staleness})`;
}

// Format Airtable AI Summary field: value only, with "(Stale)" suffix if stale
function formatAiSummary(val: unknown): string {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return String(val ?? '—');
  const obj = val as Record<string, unknown>;
  const value = obj['value'] != null ? String(obj['value']).trim() : '';
  const stale = obj['isStale'] === true;
  if (!value) return stale ? '(Stale)' : '—';
  return stale ? `${value} (Stale)` : value;
}

// Format Airtable user/assignee object: { id, email, name } → "Name (email)"
function formatAssignee(val: unknown): string {
  if (typeof val !== 'object' || val === null) return String(val ?? '—');
  const obj = val as Record<string, unknown>;
  const name = String(obj['name'] ?? '');
  const email = String(obj['email'] ?? '');
  if (name && email) return `${name} (${email})`;
  return name || email || '—';
}

function isIsoDate(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(val);
}

function formatLocalDate(val: string): string {
  const d = new Date(val);
  return isNaN(d.getTime()) ? val : d.toLocaleString();
}

function buildEntries(
  keys: string[],
  record: Record<string, unknown>,
  skip: Set<string>,
): { key: string; value: unknown }[] {
  return keys
    .filter(k => !skip.has(k) && record[k] !== undefined)
    .map(k => ({ key: k, value: record[k] }));
}

@Component({
  selector: 'app-record-detail-dialog',
  standalone: true,
  imports: [CommonModule, JsonPipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div mat-dialog-title class="dialog-header">
      <div class="header-top">
        <button mat-icon-button class="back-btn" *ngIf="data.fromDialog" (click)="dialogRef.close()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="record-name">{{ displayName }}</div>
      </div>
      <div class="record-subtitle" *ngIf="recordType || subtitle">
        <span *ngIf="recordType" class="type-dot" [class.bug]="recordType === 'bug'" [class.task]="recordType === 'task'"></span>
        <mat-icon class="subtitle-icon" *ngIf="subtitle">table_chart</mat-icon>
        <span *ngIf="subtitle">{{ subtitle }}</span>
      </div>
    </div>

    <mat-dialog-content class="detail-content">
      <div class="field-grid">

        <!-- Bug dialog -->
        <ng-container *ngIf="recordType === 'bug'">
          <div class="field-row" *ngFor="let e of preSpecialEntries">
            <span class="field-label">{{ label(e.key) }}</span>
            <span class="field-value">
              <ng-container *ngIf="rv(e.key, e.value) as fv">{{ fv }}</ng-container>
              <ng-container *ngIf="!rv(e.key, e.value)">
                <code *ngIf="isObj(e.value)" class="json-value">{{ e.value | json }}</code>
                <ng-container *ngIf="!isObj(e.value)">{{ e.value ?? '—' }}</ng-container>
              </ng-container>
            </span>
          </div>

          <div class="field-row" *ngIf="hasRelatedTask">
            <span class="field-label">Related Task</span>
            <span class="field-value related-cell">
              <mat-spinner *ngIf="loadingRelated()" diameter="16"></mat-spinner>
              <a *ngIf="!loadingRelated() && relatedTask()" class="record-link" (click)="openRelated(relatedTask()!)">
                {{ nameOf(relatedTask()!) }}
              </a>
              <span *ngIf="!loadingRelated() && !relatedTask()">—</span>
            </span>
          </div>

          <div class="field-row" *ngFor="let e of postSpecialEntries">
            <span class="field-label">{{ label(e.key) }}</span>
            <span class="field-value">
              <ng-container *ngIf="rv(e.key, e.value) as fv">{{ fv }}</ng-container>
              <ng-container *ngIf="!rv(e.key, e.value)">
                <code *ngIf="isObj(e.value)" class="json-value">{{ e.value | json }}</code>
                <ng-container *ngIf="!isObj(e.value)">{{ e.value ?? '—' }}</ng-container>
              </ng-container>
            </span>
          </div>

          <div class="field-row">
            <span class="field-label">Synced At</span>
            <span class="field-value">{{ syncedAtDisplay }}</span>
          </div>

          <div class="field-row" *ngFor="let e of remainingEntries">
            <span class="field-label">{{ label(e.key) }}</span>
            <span class="field-value">
              <ng-container *ngIf="rv(e.key, e.value) as fv">{{ fv }}</ng-container>
              <ng-container *ngIf="!rv(e.key, e.value)">
                <code *ngIf="isObj(e.value)" class="json-value">{{ e.value | json }}</code>
                <ng-container *ngIf="!isObj(e.value)">{{ e.value ?? '—' }}</ng-container>
              </ng-container>
            </span>
          </div>
        </ng-container>

        <!-- Task dialog -->
        <ng-container *ngIf="recordType === 'task'">
          <!-- Description, Priority, Assignee, Status, Due Date -->
          <div class="field-row" *ngFor="let e of genericEntries">
            <span class="field-label">{{ label(e.key) }}</span>
            <span class="field-value">
              <ng-container *ngIf="rv(e.key, e.value) as fv">{{ fv }}</ng-container>
              <ng-container *ngIf="!rv(e.key, e.value)">
                <code *ngIf="isObj(e.value)" class="json-value">{{ e.value | json }}</code>
                <ng-container *ngIf="!isObj(e.value)">{{ e.value ?? '—' }}</ng-container>
              </ng-container>
            </span>
          </div>

          <!-- Related Bugs -->
          <div class="field-row" *ngIf="hasRelatedBugs">
            <span class="field-label">Related Bugs</span>
            <span class="field-value related-cell">
              <mat-spinner *ngIf="loadingRelated()" diameter="16"></mat-spinner>
              <div *ngIf="!loadingRelated()" class="related-list">
                <a *ngFor="let bug of relatedBugs()" class="record-link" (click)="openRelated(bug)">
                  {{ nameOf(bug) }}
                </a>
                <span *ngIf="relatedBugs().length === 0">—</span>
              </div>
            </span>
          </div>

          <!-- Tags -->
          <div class="field-row" *ngIf="tagsValue().length > 0">
            <span class="field-label">Tags</span>
            <span class="field-value">
              <div class="tags-row">
                <span *ngFor="let tag of tagsValue()" class="tag-capsule">{{ tag }}</span>
              </div>
            </span>
          </div>

          <!-- AI Summary -->
          <div class="field-row" *ngIf="data.record['AI Summary'] !== undefined">
            <span class="field-label">AI Summary</span>
            <span class="field-value">{{ aiSummaryVal() }}</span>
          </div>

          <!-- Created At, Last Modified Time -->
          <div class="field-row" *ngFor="let e of postSpecialEntries">
            <span class="field-label">{{ label(e.key) }}</span>
            <span class="field-value">
              <ng-container *ngIf="rv(e.key, e.value) as fv">{{ fv }}</ng-container>
              <ng-container *ngIf="!rv(e.key, e.value)">
                <code *ngIf="isObj(e.value)" class="json-value">{{ e.value | json }}</code>
                <ng-container *ngIf="!isObj(e.value)">{{ e.value ?? '—' }}</ng-container>
              </ng-container>
            </span>
          </div>

          <!-- Remaining fields not in ordered list -->
          <div class="field-row" *ngFor="let e of remainingEntries">
            <span class="field-label">{{ label(e.key) }}</span>
            <span class="field-value">
              <ng-container *ngIf="rv(e.key, e.value) as fv">{{ fv }}</ng-container>
              <ng-container *ngIf="!rv(e.key, e.value)">
                <code *ngIf="isObj(e.value)" class="json-value">{{ e.value | json }}</code>
                <ng-container *ngIf="!isObj(e.value)">{{ e.value ?? '—' }}</ng-container>
              </ng-container>
            </span>
          </div>

          <!-- Synced At -->
          <div class="field-row">
            <span class="field-label">Synced At</span>
            <span class="field-value">{{ syncedAtDisplay }}</span>
          </div>
        </ng-container>

        <!-- Generic dialog (users, revision history, etc.) -->
        <ng-container *ngIf="!recordType">
          <div class="field-row" *ngFor="let e of genericEntries">
            <span class="field-label">{{ label(e.key) }}</span>
            <span class="field-value">
              <ng-container *ngIf="rv(e.key, e.value) as fv">{{ fv }}</ng-container>
              <ng-container *ngIf="!rv(e.key, e.value)">
                <code *ngIf="isObj(e.value)" class="json-value">{{ e.value | json }}</code>
                <ng-container *ngIf="!isObj(e.value)">{{ e.value ?? '—' }}</ng-container>
              </ng-container>
            </span>
          </div>
        </ng-container>

      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-header { padding: 20px 24px 12px; border-bottom: 1px solid #e0e0e0; }
    .header-top { display: flex; align-items: center; gap: 0; margin-bottom: 6px; }
    .back-btn { margin: -8px 4px -8px -8px; flex-shrink: 0; }
    .record-name { font-size: 1.15rem; font-weight: 600; color: #1a1a1a; }
    .type-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
    .type-dot.bug { background: #d32f2f; }
    .type-dot.task { background: #1565c0; }
    .record-subtitle { display: flex; align-items: center; gap: 4px; font-size: 0.82rem; color: #666; }
    .subtitle-icon { font-size: 14px; width: 14px; height: 14px; }

    .detail-content { min-width: 500px; max-height: 65vh; padding: 0 !important; }
    .field-grid { display: flex; flex-direction: column; }
    .field-row {
      display: grid; grid-template-columns: 160px 1fr;
      padding: 10px 24px; border-bottom: 1px solid #f0f0f0;
    }
    .field-row:nth-child(even) { background: #fafafa; }
    .field-row:last-child { border-bottom: none; }
    .field-label { font-size: 0.8rem; font-weight: 500; color: #666; padding-right: 12px; align-self: start; padding-top: 2px; }
    .field-value { font-size: 0.85rem; color: #1a1a1a; word-break: break-word; }
    .json-value { font-family: monospace; font-size: 0.75rem; color: #555; }
    .related-cell { display: flex; align-items: center; gap: 8px; }
    .related-list { display: flex; flex-direction: column; gap: 4px; }
    .record-link { color: #1565c0; cursor: pointer; text-decoration: underline; font-size: 0.85rem; }
    .record-link:hover { color: #0d47a1; }
    .tags-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .tag-capsule { background: #f0f0f0; color: #444; border-radius: 12px; padding: 2px 10px; font-size: 0.75rem; }
  `],
})
export class RecordDetailDialogComponent implements OnInit {
  displayName: string;
  subtitle: string;
  syncedAtDisplay: string;
  recordType: 'bug' | 'task' | null;

  preSpecialEntries: { key: string; value: unknown }[] = [];
  postSpecialEntries: { key: string; value: unknown }[] = [];
  genericEntries: { key: string; value: unknown }[] = [];
  remainingEntries: { key: string; value: unknown }[] = [];

  hasRelatedTask = false;
  hasRelatedBugs = false;

  relatedTask = signal<Record<string, unknown> | null>(null);
  relatedBugs = signal<Record<string, unknown>[]>([]);
  loadingRelated = signal(false);

  tagsValue = computed(() => {
    const raw = this.data.record['Tags'];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  });

  aiSummaryVal = computed(() => formatAiSummary(this.data.record['AI Summary']));

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: RecordDetailData,
    public dialogRef: MatDialogRef<RecordDetailDialogComponent>,
    private readonly dialog: MatDialog,
    private readonly apiService: ApiService,
  ) {
    const record = data.record;

    const chosenField = NAME_FIELDS.find(f => record[f] != null && String(record[f]).trim() !== '');
    this.displayName = chosenField
      ? String(record[chosenField])
      : String(record['email'] ?? record['airtableId'] ?? 'Record');

    const tableName = record['tableName'] ? String(record['tableName']) : '';
    const email = record['email'] ? String(record['email']) : '';
    this.subtitle = tableName || (email !== this.displayName ? email : '');

    const tn = tableName.toLowerCase();
    this.recordType = tn.includes('bug') ? 'bug' : tn.includes('task') ? 'task' : null;

    this.syncedAtDisplay = computeSyncedAt(record);

    const skipFields = new Set([...ALWAYS_SKIP, ...(chosenField ? [chosenField] : ['Name', 'name'])]);

    if (this.recordType === 'bug') {
      const bugAllOrdered = new Set([...BUG_PRE_ORDER, 'Related Task', ...BUG_POST_ORDER]);
      this.preSpecialEntries = buildEntries(BUG_PRE_ORDER, record, skipFields);
      this.postSpecialEntries = buildEntries(BUG_POST_ORDER, record, skipFields);
      this.remainingEntries = Object.entries(record)
        .filter(([k]) => !bugAllOrdered.has(k) && !skipFields.has(k))
        .map(([k, v]) => ({ key: k, value: v }));
      this.hasRelatedTask = !data.fromDialog && extractLinkedId(record['Related Task']) !== null;

    } else if (this.recordType === 'task') {
      const taskAllOrdered = new Set([...TASK_PRE_ORDER, ...TASK_SPECIAL, ...TASK_POST_ORDER]);
      this.genericEntries = buildEntries(TASK_PRE_ORDER, record, skipFields);
      this.postSpecialEntries = buildEntries(TASK_POST_ORDER, record, skipFields);
      this.remainingEntries = Object.entries(record)
        .filter(([k]) => !taskAllOrdered.has(k) && !skipFields.has(k))
        .map(([k, v]) => ({ key: k, value: v }));
      this.hasRelatedBugs = !data.fromDialog && extractLinkedIds(record['Related Bugs']).length > 0;

    } else {
      this.genericEntries = Object.entries(record)
        .filter(([k]) => !skipFields.has(k))
        .map(([k, v]) => ({ key: k, value: v }));
    }
  }

  ngOnInit(): void {
    const record = this.data.record;

    if (this.recordType === 'bug' && this.hasRelatedTask) {
      const taskId = extractLinkedId(record['Related Task'])!;
      this.loadingRelated.set(true);
      this.apiService.getCollectionData('tickets', {
        page: 1, limit: 1, search: '', filterField: 'airtableId', filterValue: taskId,
      }).subscribe({
        next: res => {
          this.relatedTask.set((res.data[0] ?? null) as Record<string, unknown> | null);
          this.loadingRelated.set(false);
        },
        error: () => this.loadingRelated.set(false),
      });

    } else if (this.recordType === 'task' && this.hasRelatedBugs) {
      const bugIds = extractLinkedIds(record['Related Bugs']);
      this.loadingRelated.set(true);
      forkJoin(
        bugIds.map(id =>
          this.apiService.getCollectionData('tickets', {
            page: 1, limit: 1, search: '', filterField: 'airtableId', filterValue: id,
          }).pipe(
            map(res => (res.data[0] ?? null) as Record<string, unknown> | null),
            catchError(() => of(null)),
          )
        )
      ).subscribe(results => {
        this.relatedBugs.set(results.filter((r): r is Record<string, unknown> => r !== null));
        this.loadingRelated.set(false);
      });
    }
  }

  label(key: string): string { return toLabel(key); }
  isObj(value: unknown): boolean { return value !== null && typeof value === 'object'; }
  nameOf(rec: Record<string, unknown>): string { return resolveDisplayName(rec); }

  // Unified value renderer — returns formatted string or null (fall through to JSON/raw)
  rv(key: string, value: unknown): string | null {
    if (key === 'Assignee') return formatAssignee(value);
    if (key === 'AI Summary') return formatAiSummary(value);
    if (key === 'AI Root Cause') return formatAiField(value);
    if (typeof value === 'string' && isIsoDate(value)) return formatLocalDate(value);
    return null;
  }

  openRelated(rec: Record<string, unknown>): void {
    this.dialog.open(RecordDetailDialogComponent, {
      data: { record: rec, collection: 'tickets', fromDialog: true },
      width: '600px',
      maxHeight: '80vh',
    });
  }
}

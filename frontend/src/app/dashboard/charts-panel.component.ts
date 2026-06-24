import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AgCharts } from 'ag-charts-angular';
import { AgChartOptions } from 'ag-charts-community';
import { ApiService, ChartPoint, TimelinePoint } from '../services/api.service';
import { STATUS_COLORS } from './status-colors';

@Component({
  selector: 'app-charts-panel',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatProgressSpinnerModule, AgCharts],
  template: `
    <div class="charts-grid">
      <mat-card class="chart-card">
        <mat-card-title class="chart-title">Tickets by Status</mat-card-title>
        <div class="chart-host" *ngIf="statusData().length; else noStatus">
          <ag-charts [options]="statusOptions()"></ag-charts>
        </div>
        <ng-template #noStatus
          ><p class="empty">No ticket data — run a sync first.</p></ng-template
        >
      </mat-card>

      <mat-card class="chart-card">
        <mat-card-title class="chart-title">Tickets by Priority</mat-card-title>
        <div class="chart-host" *ngIf="priorityData().length; else noPriority">
          <ag-charts [options]="priorityOptions()"></ag-charts>
        </div>
        <ng-template #noPriority
          ><p class="empty">No ticket data — run a sync first.</p></ng-template
        >
      </mat-card>

      <mat-card class="chart-card wide">
        <mat-card-title class="chart-title">Revision Activity Over Time</mat-card-title>
        <div class="chart-host" *ngIf="timelineData().length; else noTimeline">
          <ag-charts [options]="timelineOptions()"></ag-charts>
        </div>
        <ng-template #noTimeline
          ><p class="empty">No revision history — run a scrape first.</p></ng-template
        >
      </mat-card>
    </div>
  `,
  styles: [`
    :host {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .chart-card {
      display: flex;
      flex-direction: column;
      padding: 16px;
    }
    .chart-card.wide {
      grid-column: 1 / -1;
    }
    .chart-title {
      font-size: 1rem;
      margin-bottom: 8px;
    }
    .chart-host {
      width: 100%;
      height: 360px;
    }
    .chart-host ag-charts {
      display: block;
      width: 100%;
      height: 100%;
    }
    .empty {
      color: #888;
      font-size: 0.85rem;
      padding: 24px 0;
      text-align: center;
    }
  `],
})
export class ChartsPanelComponent implements OnInit {
  statusData = signal<ChartPoint[]>([]);
  priorityData = signal<ChartPoint[]>([]);
  timelineData = signal<TimelinePoint[]>([]);

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    this.api.getStats('tickets', 'Status').subscribe({ next: (d) => this.statusData.set(d), error: () => {} });
    this.api.getStats('tickets', 'Priority').subscribe({ next: (d) => this.priorityData.set(d), error: () => {} });
    this.api.getTimeline('revisionhistories').subscribe({ next: (d) => this.timelineData.set(d), error: () => {} });
  }

  statusOptions = computed<AgChartOptions>(() => ({
    data: this.statusData(),
    series: [
      {
        type: 'donut',
        angleKey: 'count',
        legendItemKey: 'key',
        innerRadiusRatio: 0.6,
        fills: this.statusData().map(
          (p) => STATUS_COLORS[p.key.toLowerCase()]?.bg ?? '#b0bec5',
        ),
      },
    ],
  }));

  priorityOptions = computed<AgChartOptions>(() => ({
    data: this.priorityData(),
    series: [{ type: 'bar', xKey: 'key', yKey: 'count', yName: 'Tickets' }],
    axes: [
      { type: 'category', position: 'bottom' },
      { type: 'number', position: 'left' },
    ],
  }));

  timelineOptions = computed<AgChartOptions>(() => ({
    data: this.timelineData(),
    series: [{ type: 'line', xKey: 'date', yKey: 'count', yName: 'Revisions' }],
    axes: [
      { type: 'category', position: 'bottom' },
      { type: 'number', position: 'left' },
    ],
  }));
}

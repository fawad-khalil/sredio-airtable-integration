import { Component, input, output, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SyncStatus, ScraperStatus } from '../services/api.service';

@Component({
  selector: 'app-sync-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatDividerModule,
    MatRadioModule,
    MatTooltipModule,
  ],
  template: `
    <mat-card class="panel-card">
      <mat-card-header class="panel-header">
        <mat-card-title>Airtable Sync</mat-card-title>
        <button
          mat-icon-button
          (click)="close.emit()"
          matTooltip="Close"
          class="panel-close-btn"
        >
          <mat-icon>close</mat-icon>
        </button>
      </mat-card-header>
      <mat-card-content>
        <button
          mat-raised-button
          color="primary"
          (click)="connect.emit()"
          *ngIf="!connected()"
          class="full-width mb-8"
        >
          <mat-icon>link</mat-icon> Connect Airtable
        </button>
        <button
          mat-raised-button
          color="primary"
          (click)="sync.emit()"
          *ngIf="connected()"
          class="full-width mb-8"
          [disabled]="syncStatus()?.syncing"
        >
          <mat-spinner
            *ngIf="syncStatus()?.syncing"
            diameter="18"
            style="
              display: inline-block;
              vertical-align: middle;
              margin-right: 6px;
            "
          ></mat-spinner>
          <mat-icon *ngIf="!syncStatus()?.syncing">sync</mat-icon>
          {{ syncStatus()?.syncing ? "Syncing…" : "Sync Now" }}
        </button>

        <div class="status-grid" *ngIf="syncStatus()">
          <div class="stat">
            <span class="label">Bases</span
            ><span class="value">{{ syncStatus()?.bases }}</span>
          </div>
          <div class="stat">
            <span class="label">Tables</span
            ><span class="value">{{ syncStatus()?.tables }}</span>
          </div>
          <div class="stat">
            <span class="label">Tickets</span
            ><span class="value">{{ syncStatus()?.tickets }}</span>
          </div>
          <div class="stat">
            <span class="label">Users</span
            ><span class="value">{{ syncStatus()?.users }}</span>
          </div>
        </div>
        <p class="last-sync" *ngIf="syncStatus()?.lastSync">
          Last sync: {{ syncStatus()?.lastSync | date: "short" }}
        </p>
        <mat-divider class="my-12"></mat-divider>

        <!-- Scraper Section -->
        <mat-card-title class="mb-8">Revision History</mat-card-title>
        <mat-radio-group
          class="login-method"
          [ngModel]="loginMethod()"
          (ngModelChange)="loginMethod.set($event)"
        >
          <mat-radio-button value="credentials"
            >Email &amp; Password (with MFA)</mat-radio-button
          >
          <mat-radio-button value="browser">Browser Login</mat-radio-button>
        </mat-radio-group>
        <button
          mat-raised-button
          color="accent"
          (click)="scrape.emit()"
          class="full-width mb-8"
          [disabled]="!connected()"
        >
          <mat-icon>history</mat-icon> Scrape Revisions
        </button>

        <div class="scraper-status" *ngIf="scraperStatus()">
          <div class="state-chip" [class]="'state-' + scraperStatus()?.state">
            {{ scraperStatus()?.state }}
          </div>
          <p class="scraper-message">
            <mat-spinner
              *ngIf="
                scraperStatus()?.state === 'extracting_cookies' ||
                scraperStatus()?.state === 'awaiting_login'
              "
              diameter="20"
              style="
                display: inline-block;
                margin-right: 8px;
                vertical-align: middle;
              "
            >
            </mat-spinner>
            {{ scraperStatus()?.message }}
          </p>
          <mat-progress-bar
            *ngIf="scraperStatus()?.state === 'scraping'"
            mode="determinate"
            [value]="
              (scraperStatus()!.progress.current /
                scraperStatus()!.progress.total) *
              100
            "
          >
          </mat-progress-bar>
          <p
            class="progress-text"
            *ngIf="scraperStatus()?.state === 'scraping'"
          >
            {{ scraperStatus()?.progress?.current }} /
            {{ scraperStatus()?.progress?.total }}
          </p>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    :host {
      width: 280px;
      flex-shrink: 0;
      overflow-y: auto;
      border-left: 1px solid #e0e0e0;
      padding: 12px;
      background: #fafafa;
    }

    .panel-card {
      box-shadow: none;
      border: 1px solid #e0e0e0;

      .panel-header {
        display: flex;
        align-items: center;
        padding-right: 4px;

        .panel-close-btn {
          margin-left: auto;
        }
      }
    }

    .full-width {
      width: 100%;
    }
    .mb-8 {
      margin-bottom: 8px;
    }
    .my-12 {
      margin: 12px 0;
    }

    .status-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 8px 0;

      .stat {
        background: #e3f2fd;
        border-radius: 4px;
        padding: 8px;
        text-align: center;
        display: flex;
        flex-direction: column;

        .label {
          font-size: 0.7rem;
          color: #555;
        }
        .value {
          font-size: 1.2rem;
          font-weight: 600;
          color: #1565c0;
        }
      }
    }

    .last-sync {
      font-size: 0.75rem;
      color: #888;
      margin: 4px 0;
    }

    .scraper-status {
      margin: 8px 0;

      .state-chip {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        background: #e0e0e0;
        color: #555;

        &.state-complete {
          background: #c8e6c9;
          color: #2e7d32;
        }
        &.state-error {
          background: #ffcdd2;
          color: #c62828;
        }
        &.state-scraping {
          background: #fff9c4;
          color: #f57f17;
        }
        &.state-awaiting_mfa {
          background: #ffe0b2;
          color: #e65100;
        }
        &.state-awaiting_login {
          background: #e8f5e9;
          color: #2e7d32;
        }
      }

      .scraper-message {
        font-size: 0.8rem;
        color: #555;
        margin: 6px 0;
      }
      .progress-text {
        font-size: 0.75rem;
        color: #888;
        text-align: right;
      }
    }

    .login-method {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
      font-size: 0.85rem;
    }
  `],
})
export class SyncPanelComponent {
  connected = input.required<boolean>();
  syncStatus = input<SyncStatus | null>(null);
  scraperStatus = input<ScraperStatus | null>(null);
  loginMethod = model<'credentials' | 'browser'>('credentials');

  close = output<void>();
  connect = output<void>();
  sync = output<void>();
  scrape = output<void>();
}

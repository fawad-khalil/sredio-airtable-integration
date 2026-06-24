import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-mfa-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon color="warn" style="vertical-align:middle;margin-right:8px">lock</mat-icon>
      MFA Required
    </h2>
    <mat-dialog-content>
      <p class="hint">Enter the 6-digit code from your authenticator app.</p>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>MFA Code</mat-label>
        <input matInput [ngModel]="mfaCode()" (ngModelChange)="mfaCode.set($event)"
               placeholder="000000" maxlength="6" pattern="[0-9]{6}"
               [disabled]="submitting()" (keydown.enter)="submit()">
      </mat-form-field>
      <p class="error" *ngIf="errorMessage()">{{ errorMessage() }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-raised-button color="primary"
              [disabled]="!mfaCode() || submitting()"
              (click)="submit()">
        <mat-spinner *ngIf="submitting()" diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner>
        {{ submitting() ? 'Submitting…' : 'Submit Code' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    .hint { font-size: .85rem; color: #666; margin: 0 0 12px; line-height: 1.4; }
    .error { color: #f44336; font-size: .8rem; margin: 4px 0 0; }
    mat-dialog-content { min-width: 320px; }
  `],
})
export class MfaDialogComponent {
  mfaCode = signal('');
  submitting = signal(false);
  errorMessage = signal('');

  constructor(
    private readonly api: ApiService,
    private readonly dialogRef: MatDialogRef<MfaDialogComponent>,
  ) {}

  /** Called by the dashboard when the backend reports the submitted code was rejected. */
  markRejected(): void {
    this.submitting.set(false);
    this.errorMessage.set('Invalid code. Please try again.');
    this.mfaCode.set('');
  }

  submit(): void {
    const code = this.mfaCode();
    if (!code || this.submitting()) return;
    this.errorMessage.set('');
    this.submitting.set(true);
    this.api.submitMfaCode(code).subscribe({
      next: () => {
        // Stay in submitting state — the dashboard closes this dialog when the scraper
        // moves on from 'awaiting_mfa'. Only errors should re-enable the button.
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Failed to submit code. Please try again.');
      },
    });
  }
}

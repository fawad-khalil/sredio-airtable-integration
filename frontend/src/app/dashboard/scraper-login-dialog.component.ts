import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ScraperLoginResult {
  email: string;
  password: string;
}

@Component({
  selector: 'app-scraper-login-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Airtable Login</h2>
    <mat-dialog-content>
      <p class="hint">Used once to capture cookies for revision-history scraping. If 2FA is enabled, you'll be prompted for the code next.</p>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Email</mat-label>
        <input matInput type="email" [ngModel]="email()" (ngModelChange)="email.set($event)" autocomplete="off">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Password</mat-label>
        <input matInput type="password" [ngModel]="password()" (ngModelChange)="password.set($event)" autocomplete="off">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="submit()" [disabled]="!email() || !password()">
        <mat-icon>login</mat-icon> Sign In
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; }
    .hint { font-size: 0.8rem; color: #666; margin: 0 0 12px; line-height: 1.4; }
    mat-dialog-content { min-width: 320px; }
  `],
})
export class ScraperLoginDialogComponent {
  email = signal('');
  password = signal('');

  constructor(private readonly dialogRef: MatDialogRef<ScraperLoginDialogComponent, ScraperLoginResult>) {}

  submit(): void {
    if (!this.email() || !this.password()) return;
    this.dialogRef.close({ email: this.email(), password: this.password() });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}

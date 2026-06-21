import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
      <mat-spinner *ngIf="!error"></mat-spinner>
      <p *ngIf="!error" style="color:#555;">Completing authentication...</p>
      <p *ngIf="error" style="color:#d32f2f;">Authentication failed. <a href="/dashboard">Return to dashboard</a></p>
    </div>
  `
})
export class CallbackComponent implements OnInit {
  error = false;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['connected'] === 'true') {
        setTimeout(() => this.router.navigate(['/dashboard']), 1000);
      } else if (params['error']) {
        this.error = true;
      } else {
        this.router.navigate(['/dashboard']);
      }
    });
  }
}

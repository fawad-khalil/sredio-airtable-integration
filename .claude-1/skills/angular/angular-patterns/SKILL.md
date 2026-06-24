# Angular Patterns — FSD Task

**Auto-invokes on:** Angular, component, service, standalone, Angular Material, routing, RxJS, NgModule, inject, signal, HttpClient

---

## Angular 19 Standalone Components

Prefer standalone: true — no NgModule boilerplate.

```typescript
import { Component, inject, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatToolbarModule, MatSelectModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private readonly dataService = inject(DataService);
  readonly collections = signal<string[]>([]);

  ngOnInit() {
    this.dataService.getCollections().subscribe(cols => this.collections.set(cols));
  }
}
```

---

## Angular Material Imports Cheatsheet

| UI Need | Import |
|---------|--------|
| Toolbar | `MatToolbarModule` |
| Dropdown/Select | `MatSelectModule` |
| Text input | `MatInputModule`, `MatFormFieldModule` |
| Button | `MatButtonModule` |
| Icon | `MatIconModule` |
| Progress spinner | `MatProgressSpinnerModule` |
| Snackbar/toast | `MatSnackBarModule` |
| Dialog/modal | `MatDialogModule` |
| Card | `MatCardModule` |
| Sidenav | `MatSidenavModule` |

---

## Service Pattern (HttpClient + RxJS)

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  getCollections(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/collections`);
  }

  getRecords(collection: string, page: number, pageSize: number): Observable<CollectionPage> {
    const params = new HttpParams()
      .set('skip', page * pageSize)
      .set('limit', pageSize);
    return this.http.get<CollectionPage>(`${this.baseUrl}/collections/${collection}`, { params });
  }
}
```

---

## RxJS Patterns

```typescript
import { switchMap, takeUntilDestroyed, debounceTime } from 'rxjs/operators';
import { Subject } from 'rxjs';

// Destroy-safe subscription (Angular 16+)
export class MyComponent {
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.service.getData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.data.set(data));
  }
}

// Search debounce
searchTerm$ = new Subject<string>();
results$ = this.searchTerm$.pipe(
  debounceTime(300),
  switchMap(term => this.service.search(term))
);
```

---

## Reactive Forms (MFA Input / Config)

```typescript
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MatInputModule, MatButtonModule, MatFormFieldModule],
})
export class MfaFormComponent {
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.group({
    mfaCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
  });

  submit() {
    if (this.form.valid) {
      this.scraperService.submitMfa(this.form.value.mfaCode!);
    }
  }
}
```

---

## Routing (app.routes.ts)

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'auth/callback', loadComponent: () => import('./auth/oauth-callback.component').then(m => m.OAuthCallbackComponent) },
  { path: 'settings', loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent) },
];
```

---

## app.config.ts (Bootstrap)

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAnimationsAsync(),
  ],
};
```

---

## Angular Material Layout Template

```html
<mat-toolbar color="primary">
  <span>Airtable Integration Dashboard</span>
  <span class="spacer"></span>
  <mat-select placeholder="Integration" [formControl]="integrationCtrl">
    <mat-option value="airtable">Airtable</mat-option>
  </mat-select>
</mat-toolbar>

<mat-sidenav-container>
  <mat-sidenav mode="side" opened>
    <!-- Entity dropdown -->
    <mat-form-field appearance="outline">
      <mat-label>Collection</mat-label>
      <mat-select [formControl]="collectionCtrl">
        <mat-option *ngFor="let col of collections()" [value]="col">{{ col }}</mat-option>
      </mat-select>
    </mat-form-field>
  </mat-sidenav>
  <mat-sidenav-content>
    <router-outlet />
  </mat-sidenav-content>
</mat-sidenav-container>
```

```css
.spacer { flex: 1 1 auto; }
mat-sidenav { width: 240px; padding: 16px; }
```

---

## Environment Config

```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
};
```

Use `inject(ENVIRONMENT)` via an injection token, or import directly for simplicity in MVP.

import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./auth/callback/callback.component').then(m => m.CallbackComponent)
  },
  { path: '**', redirectTo: 'dashboard' }
];

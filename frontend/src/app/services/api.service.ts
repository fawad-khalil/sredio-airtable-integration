import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
export interface Collection { name: string; count: number; }
export interface CollectionData { data: Record<string, unknown>[]; total: number; fields: string[]; }
export interface SyncStatus { bases: number; tables: number; tickets: number; users: number; lastSync: string | null; syncing: boolean; }
export interface ScraperStatus { state: string; progress: { current: number; total: number }; message: string; hasCookies: boolean; mfaPrompts?: number; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly api = import.meta.env['NG_APP_API_URL'];

  constructor(private readonly http: HttpClient) {}

  private get connHeaders(): { headers: HttpHeaders } {
    const id = localStorage.getItem('connectionId') ?? '';
    return { headers: new HttpHeaders({ 'X-Connection-Id': id }) };
  }

  getAuthStatus(): Observable<{ connected: boolean }> {
    const id = localStorage.getItem('connectionId') ?? '';
    return this.http.get<{ connected: boolean }>(
      `${this.api}/auth/airtable/status`,
      { params: new HttpParams().set('connectionId', id) },
    );
  }

  getSyncStatus(): Observable<SyncStatus> {
    return this.http.get<SyncStatus>(`${this.api}/sync/status`, this.connHeaders);
  }

  startSync(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/sync/start`, {}, this.connHeaders);
  }

  getScraperStatus(): Observable<ScraperStatus> {
    return this.http.get<ScraperStatus>(`${this.api}/scraper/status`, this.connHeaders);
  }

  startScraper(
    payload: { method: string; email?: string; password?: string } = { method: 'browser' },
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/scraper/start`, payload, this.connHeaders);
  }

  submitMfaCode(code: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/scraper/mfa`, { code });
  }

  setCookies(cookies: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/scraper/cookies`, { cookies }, this.connHeaders);
  }

  getCollections(): Observable<Collection[]> {
    return this.http.get<Collection[]>(`${this.api}/collections`);
  }

  getCollectionData(
    name: string,
    params: { page: number; limit: number; search: string; filterField?: string; filterValue?: string },
  ): Observable<CollectionData> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('limit', params.limit.toString())
      .set('search', params.search);
    if (params.filterField) httpParams = httpParams.set('filterField', params.filterField);
    if (params.filterValue) httpParams = httpParams.set('filterValue', params.filterValue);
    return this.http.get<CollectionData>(
      `${this.api}/collections/${name}`,
      { params: httpParams },
    );
  }
}

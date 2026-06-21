import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Collection { name: string; count: number; }
export interface CollectionData { data: Record<string, unknown>[]; total: number; fields: string[]; }
export interface SyncStatus { bases: number; tables: number; tickets: number; users: number; lastSync: string | null; syncing: boolean; }
export interface ScraperStatus { state: string; progress: { current: number; total: number }; message: string; hasCookies: boolean; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly api = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getAuthStatus(): Observable<{ connected: boolean }> {
    return this.http.get<{ connected: boolean }>(`${this.api}/auth/airtable/status`);
  }

  getSyncStatus(): Observable<SyncStatus> {
    return this.http.get<SyncStatus>(`${this.api}/sync/status`);
  }

  startSync(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/sync/start`, {});
  }

  getScraperStatus(): Observable<ScraperStatus> {
    return this.http.get<ScraperStatus>(`${this.api}/scraper/status`);
  }

  startScraper(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/scraper/start`, {});
  }

  submitMfaCode(code: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/scraper/mfa`, { code });
  }

  setCookies(cookies: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/scraper/cookies`, { cookies });
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
    return this.http.get<CollectionData>(`${this.api}/collections/${name}`, { params: httpParams });
  }
}

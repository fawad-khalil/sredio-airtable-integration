import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

interface AirtableTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

@Injectable()
export class AuthService {
  private readonly pkceStore = new Map<string, string>(); // state -> code_verifier
  private readonly tokensPath = path.join(process.cwd(), 'data', 'tokens.json');

  constructor(private readonly config: ConfigService) {
    fs.mkdirSync(path.dirname(this.tokensPath), { recursive: true });
  }

  generateAuthUrl(): { url: string; state: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    this.pkceStore.set(state, codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.get('AIRTABLE_CLIENT_ID', ''),
      redirect_uri: this.getRedirectUri(),
      scope: 'data.records:read data.recordComments:read schema.bases:read user.email:read',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return { url: `https://airtable.com/oauth2/v1/authorize?${params}`, state };
  }

  async exchangeCode(code: string, state: string): Promise<AirtableTokens> {
    const codeVerifier = this.pkceStore.get(state);
    if (!codeVerifier) throw new Error('Invalid state parameter');
    this.pkceStore.delete(state);

    const clientId = this.config.get('AIRTABLE_CLIENT_ID', '');
    const clientSecret = this.config.get('AIRTABLE_CLIENT_SECRET', '');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const { data } = await axios.post<AirtableTokens>(
      'https://airtable.com/oauth2/v1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.getRedirectUri(),
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
      { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const tokens = { ...data, created_at: Date.now() };
    fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2));
    return tokens;
  }

  private getRedirectUri(): string {
    const port = this.config.get<number>('PORT', 3000);
    const backendUrl = this.config.get('BACKEND_URL', `http://localhost:${port}`);
    return `${backendUrl}/auth/airtable/callback`;
  }

  getTokens(): AirtableTokens | null {
    try {
      return JSON.parse(fs.readFileSync(this.tokensPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  isConnected(): boolean {
    const tokens = this.getTokens();
    if (!tokens) return false;
    const expiresAt = tokens.created_at + tokens.expires_in * 1000;
    return Date.now() < expiresAt - 60000;
  }

  getAccessToken(): string {
    const tokens = this.getTokens();
    if (!tokens) throw new Error('Not authenticated with Airtable');
    return tokens.access_token;
  }
}

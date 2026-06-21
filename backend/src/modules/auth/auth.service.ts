import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import axios from 'axios';
import { OAuthToken, OAuthTokenDocument } from '../../schemas/oauth-token.schema';

interface AirtableTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

@Injectable()
export class AuthService {
  private readonly pkceStore = new Map<string, { codeVerifier: string; connectionId: string }>();

  constructor(
    private readonly config: ConfigService,
    @InjectModel(OAuthToken.name) private readonly oauthTokenModel: Model<OAuthTokenDocument>,
  ) {}

  generateAuthUrl(): { url: string; state: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    const connectionId = crypto.randomUUID();
    this.pkceStore.set(state, { codeVerifier, connectionId });

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

  async exchangeCode(code: string, state: string): Promise<{ connectionId: string }> {
    const entry = this.pkceStore.get(state);
    if (!entry) throw new Error('Invalid state parameter');
    this.pkceStore.delete(state);

    const { codeVerifier, connectionId } = entry;
    const clientId = this.config.get('AIRTABLE_CLIENT_ID', '');
    const clientSecret = this.config.get('AIRTABLE_CLIENT_SECRET', '');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const { data } = await axios.post<AirtableTokenResponse>(
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

    await this.oauthTokenModel.updateOne(
      { connectionId },
      {
        $set: {
          connectionId,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          tokenType: data.token_type,
          expiresIn: data.expires_in,
          scope: data.scope,
          tokenCreatedAt: Date.now(),
        },
      },
      { upsert: true },
    );

    return { connectionId };
  }

  private getRedirectUri(): string {
    const port = this.config.get<number>('PORT', 3000);
    const backendUrl = this.config.get('BACKEND_URL', `http://localhost:${port}`);
    return `${backendUrl}/auth/airtable/callback`;
  }

  async getAccessToken(connectionId: string): Promise<string> {
    const token = await this.oauthTokenModel.findOne({ connectionId }).lean();
    if (!token) throw new Error('Not authenticated with Airtable');
    return token.accessToken;
  }

  async isConnected(connectionId: string): Promise<boolean> {
    if (!connectionId) return false;
    const token = await this.oauthTokenModel.findOne({ connectionId }).lean();
    if (!token) return false;
    const expiresAt = token.tokenCreatedAt + token.expiresIn * 1000;
    return Date.now() < expiresAt - 60000;
  }
}

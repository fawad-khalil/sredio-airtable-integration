# Airtable Integration Patterns — FSD Task

**Auto-invokes on:** Airtable, OAuth, bases, tables, tickets, pages, pagination, API sync, /meta/bases, PKCE, offset cursor

---

## OAuth 2.0 PKCE Flow

Airtable uses standard OAuth 2.0 with PKCE. No client secret required for PKCE.

### Authorize URL

```
https://airtable.com/oauth2/v1/authorize
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=http://localhost:3000/auth/airtable/callback
  &scope=data.records:read data.recordComments:read schema.bases:read
  &state=RANDOM_STATE
  &code_challenge=BASE64URL(SHA256(code_verifier))
  &code_challenge_method=S256
```

### PKCE Generation (Node.js)

```typescript
import crypto from 'crypto';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
```

### Token Exchange

```typescript
async function exchangeCode(code: string, verifier: string): Promise<AirtableTokens> {
  const response = await fetch('https://airtable.com/oauth2/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.AIRTABLE_REDIRECT_URI!,
      client_id: process.env.AIRTABLE_CLIENT_ID!,
      code_verifier: verifier,
    }),
  });
  return response.json();
}
```

### Token Refresh

```typescript
async function refreshToken(refreshToken: string): Promise<AirtableTokens> {
  const response = await fetch('https://airtable.com/oauth2/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.AIRTABLE_CLIENT_ID!,
    }),
  });
  return response.json();
}
```

### Token Model

```typescript
interface AirtableTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;       // seconds
  scope: string;
}
```

Store tokens server-side only. Never expose access_token to the Angular client.

---

## REST API Base URL

```
https://api.airtable.com/v0
```

All requests require: `Authorization: Bearer <access_token>`

---

## Endpoints

### List Bases (Projects)

```
GET /meta/bases
```

Response:
```json
{
  "bases": [
    { "id": "appXXX", "name": "My Base", "permissionLevel": "create" }
  ],
  "offset": "optional_cursor"
}
```

### List Tables

```
GET /meta/bases/{baseId}/tables
```

Response includes `fields` array per table:
```json
{
  "tables": [
    {
      "id": "tblXXX",
      "name": "Tasks",
      "fields": [{ "id": "fldXXX", "name": "Status", "type": "singleSelect" }]
    }
  ]
}
```

### List Records (Tickets / Pages)

```
GET /{baseId}/{tableId}?pageSize=100&offset={cursor}
```

Response:
```json
{
  "records": [{ "id": "recXXX", "fields": { "Name": "...", "Status": "..." } }],
  "offset": "next_cursor"
}
```

### List Users

```
GET /users
```

Response:
```json
{
  "users": [{ "id": "usrXXX", "email": "...", "name": "..." }]
}
```

---

## Pagination Pattern (Cursor-based)

Airtable returns an `offset` string when more pages exist. Loop until no offset.

```typescript
async function fetchAllRecords(baseId: string, tableId: string, token: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${tableId}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;

    // Rate limit: 5 req/sec per base
    await delay(200);
  } while (offset);

  return records;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
```

---

## MongoDB Upsert on Sync

```typescript
// Upsert so re-sync doesn't create duplicates
async function upsertTickets(records: AirtableRecord[], baseId: string, tableId: string) {
  const ops = records.map(rec => ({
    updateOne: {
      filter: { airtableId: rec.id },
      update: { $set: { airtableId: rec.id, baseId, tableId, fields: rec.fields, syncedAt: new Date() } },
      upsert: true,
    }
  }));
  await TicketModel.bulkWrite(ops);
}
```

---

## Scopes Required

| Scope | Needed For |
|-------|-----------|
| `data.records:read` | Reading tickets/pages |
| `data.recordComments:read` | Comments (if needed later) |
| `schema.bases:read` | Reading bases and tables |
| `user.email:read` | Reading user info |

---

## Rate Limits

- **5 requests per second** per base
- Add 200ms delay between page fetches
- On 429 response: wait `Retry-After` header value (or default 30s), then retry
- Use `p-limit(3)` for parallel base syncs to stay under global limits

```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // max 3 bases in parallel
await Promise.all(bases.map(base => limit(() => syncBase(base))));
```

---

## Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Token expired | Refresh token, retry once |
| 403 | Insufficient scope | Show scope error to user |
| 404 | Base/table deleted | Mark as inactive in MongoDB |
| 429 | Rate limited | Wait Retry-After, retry |
| 422 | Invalid request | Log and skip record |

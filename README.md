# FS Task — Airtable Integration Dashboard

Sync Airtable data to MongoDB, scrape revision history, and display it via an Angular + AG Grid dashboard.

**Stack:** Angular 19 · Angular Material · AG Grid 33 · NestJS · Node.js 22 · MongoDB · Redis

## Setup

### Prerequisites

- **Node.js 22.23.0** (see [.tool-versions](.tool-versions); use `asdf install` if you use asdf)
- **MongoDB** and **Redis** running locally — or use Docker (see below)
- An **Airtable OAuth app** for `AIRTABLE_CLIENT_ID` / `AIRTABLE_CLIENT_SECRET`

---

### Option A — Docker Compose (everything)

Runs MongoDB, Redis, the backend, and the frontend.

```bash
# 1. Create the backend env file and fill in your Airtable credentials
cp backend/.env.example backend/.env

# 2. Build and start all services
docker compose up --build
```

- Frontend: http://localhost:4200
- Backend: http://localhost:3005
- MongoDB: localhost:27017
- Redis: localhost:6379

---

### Option B — Run locally

#### 1. Start MongoDB + Redis

Either install them natively, or start just those two with Docker:

```bash
docker compose up mongo redis
```

#### 2. Backend

```bash
cd backend
cp .env.example .env        # then fill in the Airtable credentials
npm install
npm run start:dev           # watch mode at http://localhost:3005
```

#### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start                   # ng serve at http://localhost:4200
```

---

## Environment variables

### `backend/.env`

| Variable                 | Description                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `MONGODB_URI`            | MongoDB connection string (e.g. `mongodb://localhost:27017/airtable-dashboard`) |
| `AIRTABLE_CLIENT_ID`     | Airtable OAuth app client ID                                                    |
| `AIRTABLE_CLIENT_SECRET` | Airtable OAuth app client secret                                                |
| `AIRTABLE_REDIRECT_URI`  | OAuth callback URL (must match the Airtable app config)                         |
| `FRONTEND_URL`           | Frontend origin, for CORS / redirects (`http://localhost:4200`)                 |
| `PORT`                   | Backend port                                                                    |
| `REDIS_URL`              | Redis connection string (e.g. `redis://localhost:6379`)                         |
| `REDIS_COOKIE_TTL`       | Scraper cookie TTL in seconds (default `604800`)                                |

### `frontend/.env`

| Variable         | Description                 |
| ---------------- | --------------------------- |
| `NG_APP_API_URL` | Base URL of the backend API |

---

## Common commands

```bash
# Backend
cd backend
npm run start:dev      # dev server (watch)
npm run build          # compile to dist/
npm test               # Jest tests
npm run lint           # ESLint

# Frontend
cd frontend
npm start              # ng serve
npm run build          # production build
npm test               # Karma/Jasmine tests
```

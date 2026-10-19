# Maintenance Request System

CPS 714 team project. Stack: React (Vite + TS) + Express (TS) + PostgreSQL via Prisma, JWT auth.

## Structure

- `frontend/` — React + TypeScript UI (Vite, `react-router-dom`, `axios`)
- `backend/` — Express + TypeScript API (Prisma, zod validation, bcrypt + JWT auth)
- `docker-compose.yml` — local PostgreSQL for development (port 5434)

## Environment setup

Full step-by-step guide (Docker install, Windows tips, no-Docker option, troubleshooting): **[docs/SETUP.md](docs/SETUP.md)**

Quick version, with Docker Desktop open:

```
cd backend
npm install
npm run db:up               # Postgres in Docker (port 5434), waits until ready
npm run setup               # .env + tables + demo users/sample requests (safe to re-run after every git pull)
npm run dev                 # API at http://localhost:4000
npm test                    # all backend tests (db tests skip if postgres isn't running)
```

```
cd frontend
npm install
npm run dev                 # UI at http://localhost:5173
```

Optional: browse the database with `cd backend && npx prisma studio` (http://localhost:5555).

## Demo users

All passwords are `password123`.

| Email | Role | Lands on |
|---|---|---|
| customer@demo.com | CUSTOMER | `/requests` — submit + view my requests |
| tech@demo.com | TECHNICIAN | `/technician` |
| tech2@demo.com | TECHNICIAN | `/technician` (second technician for assigning) |
| manager@demo.com | MANAGER | `/manager` |
| admin@demo.com | ADMIN | `/admin` |

## Status

Sprint 1 (stories #1–#3) is done:

- **#1 Log in with role** — JWT login, role-based route guards on the frontend, `requireRole` checks on the API
- **#2 Submit a maintenance request** — title, description, location, category, priority; validated and saved with status `Submitted`
- **#3 View my requests** — a user's own requests, newest first, with status

Sprint 2 (stories #4–#7) is in progress. Goal: a manager sees all open requests and assigns one to a technician, who updates it through to "Resolved" and adds notes. The API contract the team builds to is in **[docs/sprint-2-api.md](docs/sprint-2-api.md)**.

- Schema: requests have an assigned technician, plus a Notes table (`20261019170000_add_assignment_and_notes`)
- Done: `GET /api/requests/open` (#4), `GET /api/requests/assigned` (#6), `GET /api/requests/:id` (detail + notes), `GET /api/users/technicians`
- To do: assign (#5), update status + add note (#7) APIs, and the manager/technician/detail pages. Their tests are already in `backend/tests/sprint2.test.ts` and show as TODO until built

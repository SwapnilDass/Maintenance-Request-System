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

Sprint 2 (stories #4–#7) is done. Goal: a manager sees all open requests and assigns one to a technician, who updates it through to "Resolved" and adds notes. API contract: **[docs/sprint-2-api.md](docs/sprint-2-api.md)**.

- **#4 All open requests** — manager page (`/manager`, admins see it too) with priority + status, most urgent first
- **#5 Assign to a technician** — dropdown on each request; reassigning moves it to the new technician
- **#6 My assigned requests** — technician page (`/technician`), unfinished work first
- **#7 Update status + notes** — request detail page (`/requests/:id`): the assigned technician moves Assigned → In Progress → Resolved; technician/manager add notes; the customer reads them
- Schema: requests have an assigned technician, plus a Notes table (`20261019170000_add_assignment_and_notes`)

Admin tools (manage users and categories) are Sprint 3.

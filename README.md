# Maintenance Request System

CPS 714 team project. Stack: React (Vite + TS) + Express (TS) + PostgreSQL via Prisma, JWT auth.

## Structure

- `frontend/` — React + TypeScript UI (Vite, `react-router-dom`, `axios`)
- `backend/` — Express + TypeScript API (Prisma, zod validation, bcrypt + JWT auth)
- `docker-compose.yml` — local PostgreSQL for development (port 5434)

## Environment setup

1. Start the database:
   ```
   docker compose up -d
   ```
   (no Docker? any Postgres 16 on port 5434 with user/password `postgres` and a `maintenance_db` database works too)
2. Backend:
   ```
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate dev      # creates the tables
   npm run prisma:seed         # demo users + categories
   npm run dev                 # API at http://localhost:4000
   npm test                    # all backend tests (db tests skip if postgres isn't running)
   ```
3. Frontend:
   ```
   cd frontend
   npm install
   npm run dev                 # UI at http://localhost:5173
   ```
4. Optional — browse the database: `cd backend && npx prisma studio` (http://localhost:5555)

## Demo users

All passwords are `password123`.

| Email | Role | Lands on |
|---|---|---|
| customer@demo.com | CUSTOMER | `/requests` — submit + view my requests |
| tech@demo.com | TECHNICIAN | `/technician` |
| manager@demo.com | MANAGER | `/manager` |
| admin@demo.com | ADMIN | `/admin` |

## Status

Sprint 1 (stories #1–#3) is done:

- **#1 Log in with role** — JWT login, role-based route guards on the frontend, `requireRole` checks on the API
- **#2 Submit a maintenance request** — title, description, location, category, priority; validated and saved with status `Submitted`
- **#3 View my requests** — a user's own requests, newest first, with status

Technician, manager and admin pages are placeholders for Sprints 2–3.

# Maintenance Request System

CPS 714 team project. Stack: React (Vite + TS) + Express (TS) + PostgreSQL via Prisma, JWT auth.

## Structure

- `frontend/` — React + TypeScript UI (Vite scaffold, `react-router-dom` and `axios` installed)
- `backend/` — Express + TypeScript API (dependencies installed: express, cors, dotenv,
  bcryptjs, jsonwebtoken, zod, prisma/@prisma/client; dev deps: typescript, ts-node-dev)
- `docker-compose.yml` — local PostgreSQL for development

## Environment setup

1. Start the database:
   ```
   docker compose up -d
   ```
2. Backend:
   ```
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate dev      # creates the tables in the docker postgres
   npm run prisma:seed         # demo user (customer@demo.com / password123) + categories
   npm run dev                 # API at http://localhost:4000
   npm test                    # story #2 + #3 tests (db tests skip if postgres isn't running)
   ```
   Scripts available in `backend/package.json`:
   - `npm run dev` — run the API with ts-node-dev (once `src/index.ts` exists)
   - `npm run prisma:generate` / `npm run prisma:migrate` — once models are added to `prisma/schema.prisma`
3. Frontend:
   ```
   cd frontend
   npm install
   npm run dev
   ```
   UI runs at http://localhost:5173.

## Status

Dependencies and tooling are installed; application code (DB schema, API routes, auth, UI pages)
has not been written yet — that's the Sprint 1 work.

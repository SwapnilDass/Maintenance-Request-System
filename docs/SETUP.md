# Local setup: Docker + database

Gets the whole app running on your machine: PostgreSQL in Docker, the API, and the React app. About 15 minutes the first time, and about 1 minute after that.

**You need:** [Node.js 22 LTS](https://nodejs.org/), [Git](https://git-scm.com/), and Docker Desktop (step 1). Check Node with `node -v`; it should print v22 or higher.

---

## 1. Install Docker Desktop (one time)

**Windows**
1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/ and run the installer. Leave **"Use WSL 2"** ticked.
2. Restart your computer when it asks.
3. Open **Docker Desktop** from the Start menu. You can skip signing in. Wait until the bottom-left corner says **Engine running**.
4. Open a **new** PowerShell window and check it worked:
   ```
   docker --version
   ```

**Mac:** download the version for your chip (Apple or Intel), drag it to Applications, open it, and wait for **Engine running**.

> Docker Desktop has to be **open** whenever you work on the project. Postgres lives inside it.

## 2. First-time project setup

```
git clone https://github.com/SwapnilDass/Maintenance-Request-System.git
cd Maintenance-Request-System/backend
npm install
npm run db:up        # starts Postgres in Docker and waits until it's ready
npm run setup        # creates .env, builds the tables, adds demo users and sample requests
npm run dev          # API at http://localhost:4000. Leave this terminal open
```

In a **second terminal**:

```
cd Maintenance-Request-System/frontend
npm install
npm run dev          # app at http://localhost:5173
```

Open http://localhost:5173 and log in as any demo user below.

## 3. Every day after that

1. Open Docker Desktop. The database starts by itself; if it doesn't, run `npm run db:up` in `backend`.
2. `cd backend` → `npm run dev`
3. `cd frontend` → `npm run dev`

## After you `git pull` new code

Run these in `backend` (and `npm install` in `frontend` too if its packages changed):

```
npm install
npm run setup
```

`setup` is safe to run any time. It only applies database changes you don't have yet (like Sprint 2's assigned-technician column and Notes table) and never deletes your data. **If you see errors like `column "assignedTechnicianId" does not exist`, you skipped this step.**

## Handy commands (run in `backend`)

| Command | What it does |
|---|---|
| `npm run db:up` | Start Postgres in Docker |
| `npm run db:down` | Stop it (your data is kept) |
| `npm run setup` | Bring the database up to date + add demo data |
| `npm run db:reset` | **Delete everything** and start fresh with demo data |
| `npm test` | Run all backend tests (Postgres must be running) |
| `npx prisma studio` | Browse and edit the database at http://localhost:5555 |

## Demo users

All passwords are `password123`.

| Email | Role |
|---|---|
| customer@demo.com | CUSTOMER |
| tech@demo.com | TECHNICIAN (Terry, has sample requests assigned) |
| tech2@demo.com | TECHNICIAN (Jordan, nothing assigned) |
| manager@demo.com | MANAGER |
| admin@demo.com | ADMIN |

The seed also adds 4 sample requests: two waiting to be assigned, one assigned to Terry, and one Terry is working on with a progress note. They're only added if the database has no requests yet.

---

## Can't use Docker?

If Docker Desktop won't install (some laptops have virtualization turned off), install PostgreSQL directly instead:

1. Download the Windows installer from https://www.postgresql.org/download/windows/. Set the password to **`postgres`**, keep port **5432**, and skip Stack Builder at the end.
2. Create the database: open **pgAdmin** (installed with it), log in with `postgres`, right-click **Databases** → **Create** → **Database…**, and name it `maintenance_db`.
3. In `backend`, run `npm run env:init`, then open `backend/.env` and change **5434** to **5432**:
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/maintenance_db?schema=public"
   ```
4. Continue from `npm run setup` in step 2. Skip `npm run db:up`.

---

## Troubleshooting

| You see | Fix |
|---|---|
| `docker : The term 'docker' is not recognized` | Docker Desktop isn't installed, or this PowerShell window was open before you installed it. Close all terminals, open a new one, and restart your computer if it still fails. |
| `error during connect` / `Cannot connect to the Docker daemon` / `dockerDesktopLinuxEngine` | Docker Desktop isn't running. Open it and wait for **Engine running**. |
| `WSL 2 installation is incomplete` | Open PowerShell **as administrator**, run `wsl --install`, then restart. |
| `Bind for 0.0.0.0:5434 failed: port is already allocated` | Another Postgres container is using the port. Run `docker ps` to find it, then `docker stop <name>`. |
| `P1001: Can't reach database server at localhost:5434` | The database isn't running. Run `npm run db:up`. |
| Login says **Invalid email or password** for a demo user | Demo users aren't in your database. Run `npm run setup`. |
| `EPERM: operation not permitted ... query_engine-windows.dll.node` | `npm run dev` is still running and locking Prisma's files. Stop it with Ctrl+C, run the command again, then restart `npm run dev`. |
| `column ... does not exist` | You pulled new code without updating the database. Run `npm run setup`. |
| `Drift detected` when running `prisma migrate dev` | Your database doesn't match the migrations. Run `npm run db:reset` (this deletes local data). |
| `npm test` shows **skipped** tests | Postgres isn't running, or `npm run setup` hasn't been run. |
| `npm test` shows **TODO** tests | Normal. Those test endpoints that haven't been built yet (see `docs/sprint-2-api.md`). |

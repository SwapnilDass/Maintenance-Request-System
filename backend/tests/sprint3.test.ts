// tests for sprint 3, run with "npm test":
//   #9  admin manages users and roles        #10 admin manages categories
//   #11 manager dashboard metrics            #13 manager changes a request's priority
//   plus an end-to-end test of the whole flow (submit -> assign -> resolve) and role access tests
//
// same setup as the other test files: tests marked "needs db" get skipped unless postgres is running,
// migrated and seeded. each run makes its own users/requests/categories and deletes them at the end
import "dotenv/config";
import { test, describe, before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";

process.env.JWT_SECRET ??= "test-secret";

import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { STATUS } from "../src/lib/status";

type Person = { id: string; name: string; email: string; role: string };

let server: Server;
let baseUrl: string;
let dbReady = false;

const run = Date.now();
let customer: Person;
let tech: Person;
let manager: Person;
let admin: Person;
let categoryId: number;

// anything the tests make through the API, so after() can clean it up
const madeUserIds: string[] = [];
const madeCategoryIds: number[] = [];

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api`;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReady = true;
  } catch {
    console.log("database not reachable, skipping the tests that need it");
    return;
  }

  const makeUser = async (role: Role, name: string) =>
    (await prisma.user.create({
      data: { email: `${role.toLowerCase()}-${randomUUID()}@test.com`, password: "x", name, role },
    })) as Person;

  customer = await makeUser("CUSTOMER", `S3 Customer ${run}`);
  tech = await makeUser("TECHNICIAN", `S3 Tech ${run}`);
  manager = await makeUser("MANAGER", `S3 Manager ${run}`);
  admin = await makeUser("ADMIN", `S3 Admin ${run}`);

  const category = await prisma.category.findFirst();
  assert.ok(category, "run npm run prisma:seed first");
  categoryId = category.id;
});

after(async () => {
  server.close();
  if (dbReady) {
    const ids = [customer, tech, manager, admin].filter(Boolean).map((u) => u.id).concat(madeUserIds);
    await prisma.note.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.request.deleteMany({
      where: { OR: [{ userId: { in: ids } }, { assignedTechnicianId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.request.deleteMany({ where: { categoryId: { in: madeCategoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: madeCategoryIds } } });
  }
  await prisma.$disconnect();
});

// ---- helpers ----

function tokenFor(user: { id: string; role: string }) {
  return jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET as string);
}

function api(method: string, path: string, as?: { id: string; role: string }, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(as ? { Authorization: `Bearer ${tokenFor(as)}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function login(email: string, password: string) {
  return api("POST", "/auth/login", undefined, { email, password });
}

let made = 0;
function makeRequest(data: { priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; status?: string; assignedTechnicianId?: string; categoryId?: number }) {
  made++;
  return prisma.request.create({
    data: {
      title: `S3 request ${run}-${made}`,
      description: "test",
      location: "test",
      priority: data.priority ?? "MEDIUM",
      status: data.status ?? STATUS.SUBMITTED,
      userId: customer.id,
      categoryId: data.categoryId ?? categoryId,
      assignedTechnicianId: data.assignedTechnicianId,
    },
  });
}

// admin adds a user through the API (the way the admin page does), remembered for cleanup
async function addUser(role: string, password = "password123") {
  const email = `s3-${role.toLowerCase()}-${randomUUID()}@test.com`;
  const res = await api("POST", "/users", admin, { name: `S3 ${role} ${run}`, email, password, role });
  assert.equal(res.status, 201);
  const user = await res.json();
  assert.ok(!("password" in user), "the API never sends the password hash back");
  madeUserIds.push(user.id);
  return { ...user, password } as Person & { password: string; active: boolean };
}

async function addCategory(name: string) {
  const res = await api("POST", "/categories", admin, { name });
  const body = await res.json();
  if (res.status === 201) madeCategoryIds.push(body.id);
  return { res, body };
}

function needsDb(t: TestContext) {
  if (!dbReady) t.skip("database not running");
  return !dbReady;
}

const fakeId = () => randomUUID();
const asRole = (role: string) => ({ id: "someone", role });

// ---- story #9: admin manages users and roles ----

describe("story #9 - admin manages users (/api/users)", () => {
  test("the admin sees every user, without passwords (needs db)", async (t) => {
    if (needsDb(t)) return;
    const res = await api("GET", "/users", admin);
    assert.equal(res.status, 200);
    const users: Record<string, unknown>[] = await res.json();
    assert.ok(users.some((u) => u.id === tech.id), "should list the test technician");
    assert.ok(users.every((u) => !("password" in u)), "no password hashes");
    assert.ok(users.every((u) => typeof u.active === "boolean"));
  });

  test("the admin adds a user, who can then log in with that role (needs db)", async (t) => {
    if (needsDb(t)) return;
    const user = await addUser("TECHNICIAN");
    assert.equal(user.role, "TECHNICIAN");
    assert.equal(user.active, true);

    const res = await login(user.email, "password123");
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.role, "TECHNICIAN");
  });

  test("adding a user with a bad email, short password or made up role returns 400 (needs db)", async (t) => {
    if (needsDb(t)) return;
    const good = { name: "Someone", email: `s3-${randomUUID()}@test.com`, password: "password123", role: "CUSTOMER" };
    for (const bad of [
      { ...good, email: "not-an-email" },
      { ...good, password: "short" },
      { ...good, role: "SUPERUSER" },
      { ...good, name: "   " },
    ]) {
      assert.equal((await api("POST", "/users", admin, bad)).status, 400, JSON.stringify(bad));
    }
  });

  test("adding a user with an email that's already taken returns 409 (needs db)", async (t) => {
    if (needsDb(t)) return;
    const res = await api("POST", "/users", admin, {
      name: "Copy",
      email: tech.email.toUpperCase(), // emails are compared lowercase
      password: "password123",
      role: "CUSTOMER",
    });
    assert.equal(res.status, 409);
  });

  test("the admin changes a user's role (needs db)", async (t) => {
    if (needsDb(t)) return;
    const user = await addUser("CUSTOMER");
    const res = await api("PATCH", `/users/${user.id}/role`, admin, { role: "MANAGER" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).role, "MANAGER");

    // the new role is in their next login
    const loginRes = await login(user.email, user.password);
    assert.equal((await loginRes.json()).user.role, "MANAGER");
  });

  test("an admin can't change their own role or deactivate themselves (needs db)", async (t) => {
    if (needsDb(t)) return;
    assert.equal((await api("PATCH", `/users/${admin.id}/role`, admin, { role: "CUSTOMER" })).status, 400);
    assert.equal((await api("PATCH", `/users/${admin.id}/active`, admin, { active: false })).status, 400);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert.equal(after.role, "ADMIN");
    assert.equal(after.active, true);
  });

  test("a deactivated user can't log in, is logged out, and can't be assigned work (needs db)", async (t) => {
    if (needsDb(t)) return;
    const user = await addUser("TECHNICIAN");
    const res = await api("PATCH", `/users/${user.id}/active`, admin, { active: false });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).active, false);

    assert.equal((await login(user.email, user.password)).status, 403, "can't log in");
    assert.equal((await api("GET", "/auth/me", user)).status, 401, "a saved login stops working");

    const techs: Person[] = await (await api("GET", "/users/technicians", manager)).json();
    assert.ok(!techs.some((x) => x.id === user.id), "not in the assign dropdown");

    const request = await makeRequest({});
    assert.equal((await api("PATCH", `/requests/${request.id}/assign`, manager, { technicianId: user.id })).status, 400);
  });

  test("a reactivated user can log in again (needs db)", async (t) => {
    if (needsDb(t)) return;
    const user = await addUser("CUSTOMER");
    await api("PATCH", `/users/${user.id}/active`, admin, { active: false });
    assert.equal((await api("PATCH", `/users/${user.id}/active`, admin, { active: true })).status, 200);
    assert.equal((await login(user.email, user.password)).status, 200);
  });

  test("a user that doesn't exist returns 404 (needs db)", async (t) => {
    if (needsDb(t)) return;
    assert.equal((await api("PATCH", `/users/${fakeId()}/role`, admin, { role: "CUSTOMER" })).status, 404);
    assert.equal((await api("PATCH", `/users/${fakeId()}/active`, admin, { active: false })).status, 404);
  });
});

// ---- story #10: admin manages categories ----

describe("story #10 - admin manages categories (/api/categories)", () => {
  test("the admin adds a category and it shows in the submit form's list (needs db)", async (t) => {
    if (needsDb(t)) return;
    const name = `S3 Category ${run}`;
    const { res, body } = await addCategory(name);
    assert.equal(res.status, 201);
    assert.equal(body.name, name);

    const list: { name: string }[] = await (await api("GET", "/categories", customer)).json();
    assert.ok(list.some((c) => c.name === name), "customers see the new category");
  });

  test("an empty name returns 400, a duplicate (any capitals) returns 409 (needs db)", async (t) => {
    if (needsDb(t)) return;
    assert.equal((await addCategory("   ")).res.status, 400);
    const name = `S3 Dup ${run}`;
    await addCategory(name);
    assert.equal((await addCategory(name.toUpperCase())).res.status, 409);
  });

  test("renaming a category changes it on the requests that use it (needs db)", async (t) => {
    if (needsDb(t)) return;
    const { body: category } = await addCategory(`S3 Old ${run}`);
    const request = await makeRequest({ categoryId: category.id });

    const res = await api("PATCH", `/categories/${category.id}`, admin, { name: `S3 New ${run}` });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).requestCount, 1);

    const detail = await (await api("GET", `/requests/${request.id}`, manager)).json();
    assert.equal(detail.category.name, `S3 New ${run}`);
  });

  test("renaming to a name that's taken returns 409, a missing category 404 (needs db)", async (t) => {
    if (needsDb(t)) return;
    const { body: a } = await addCategory(`S3 A ${run}`);
    await addCategory(`S3 B ${run}`);
    assert.equal((await api("PATCH", `/categories/${a.id}`, admin, { name: `S3 B ${run}` })).status, 409);
    assert.equal((await api("PATCH", `/categories/99999999`, admin, { name: "x" })).status, 404);
  });

  test("an unused category can be deleted (needs db)", async (t) => {
    if (needsDb(t)) return;
    const { body: category } = await addCategory(`S3 Unused ${run}`);
    assert.equal((await api("DELETE", `/categories/${category.id}`, admin)).status, 204);
    assert.equal(await prisma.category.findUnique({ where: { id: category.id } }), null);
  });

  test("a category requests use can't be deleted - 409 and it's still there (needs db)", async (t) => {
    if (needsDb(t)) return;
    const { body: category } = await addCategory(`S3 Used ${run}`);
    await makeRequest({ categoryId: category.id });
    const res = await api("DELETE", `/categories/${category.id}`, admin);
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /Rename it instead/);
    assert.ok(await prisma.category.findUnique({ where: { id: category.id } }));
  });
});

// ---- story #13: manager changes priority ----

describe("story #13 - PATCH /requests/:id/priority (manager changes priority)", () => {
  test("raising a request to URGENT moves it to the top of the open list (needs db)", async (t) => {
    if (needsDb(t)) return;
    const request = await makeRequest({ priority: "LOW" });
    const res = await api("PATCH", `/requests/${request.id}/priority`, manager, { priority: "URGENT" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).priority, "URGENT");

    const open: { id: string; priority: string }[] = await (await api("GET", "/requests/open", manager)).json();
    const firstNonUrgent = open.findIndex((r) => r.priority !== "URGENT");
    const position = open.findIndex((r) => r.id === request.id);
    assert.ok(position >= 0 && (firstNonUrgent === -1 || position < firstNonUrgent), "it's among the URGENT ones at the top");
  });

  test("a made up priority returns 400 and changes nothing (needs db)", async (t) => {
    if (needsDb(t)) return;
    const request = await makeRequest({ priority: "LOW" });
    assert.equal((await api("PATCH", `/requests/${request.id}/priority`, manager, { priority: "ASAP" })).status, 400);
    assert.equal((await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).priority, "LOW");
  });

  test("a resolved request's priority can't change (400), a missing one is 404 (needs db)", async (t) => {
    if (needsDb(t)) return;
    const request = await makeRequest({ status: STATUS.RESOLVED, assignedTechnicianId: tech.id });
    assert.equal((await api("PATCH", `/requests/${request.id}/priority`, manager, { priority: "HIGH" })).status, 400);
    assert.equal((await api("PATCH", `/requests/${fakeId()}/priority`, manager, { priority: "HIGH" })).status, 404);
  });
});

// ---- story #11: manager dashboard ----

describe("story #11 - GET /metrics (manager dashboard)", () => {
  test("the numbers add up (needs db)", async (t) => {
    if (needsDb(t)) return;
    const res = await api("GET", "/metrics", manager);
    assert.equal(res.status, 200);
    const m = await res.json();

    assert.equal(m.open + m.resolved, m.total);
    assert.equal(m.byStatus.reduce((s: number, r: { count: number }) => s + r.count, 0), m.total);
    assert.equal(m.openByPriority.reduce((s: number, r: { count: number }) => s + r.count, 0), m.open);
    assert.deepEqual(m.byStatus.map((r: { status: string }) => r.status), Object.values(STATUS));
    assert.ok(m.completionRate >= 0 && m.completionRate <= 100);
  });

  test("each technician's workload counts their assigned, in progress and resolved requests (needs db)", async (t) => {
    if (needsDb(t)) return;
    await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.ASSIGNED });
    await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.ASSIGNED });
    await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.IN_PROGRESS });
    await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.RESOLVED });

    const m = await (await api("GET", "/metrics", manager)).json();
    const mine = m.workload.find((w: { id: string }) => w.id === tech.id);
    assert.ok(mine, "the technician is in the workload list");
    // counted from the db so other tests in this file can't throw it off
    const count = (status: string) => prisma.request.count({ where: { assignedTechnicianId: tech.id, status } });
    assert.equal(mine.assigned, await count(STATUS.ASSIGNED));
    assert.equal(mine.inProgress, await count(STATUS.IN_PROGRESS));
    assert.equal(mine.resolved, await count(STATUS.RESOLVED));
    assert.equal(mine.open, mine.assigned + mine.inProgress);
    assert.ok(mine.assigned >= 2 && mine.inProgress >= 1 && mine.resolved >= 1);
  });

  test("the admin can see it too (needs db)", async (t) => {
    if (needsDb(t)) return;
    assert.equal((await api("GET", "/metrics", admin)).status, 200);
  });
});

// ---- end to end: the whole flow through the API, the way the pages use it ----

describe("end to end - submit -> assign -> in progress -> note -> resolved", () => {
  test("every role sees the right thing at every step, and the dashboard counts it (needs db)", async (t) => {
    if (needsDb(t)) return;
    const before = await (await api("GET", "/metrics", manager)).json();

    // 1. customer submits
    const created = await api("POST", "/requests", customer, {
      title: `E2E ${run}`,
      description: "The heater in room 101 won't turn on",
      location: "Room 101",
      categoryId,
      priority: "LOW",
    });
    assert.equal(created.status, 201);
    const request = await created.json();
    assert.equal(request.status, STATUS.SUBMITTED);

    // 2. manager sees it in the open list, bumps the priority and assigns it
    const open1: { id: string }[] = await (await api("GET", "/requests/open", manager)).json();
    assert.ok(open1.some((r) => r.id === request.id), "manager sees the new request");
    assert.equal((await api("PATCH", `/requests/${request.id}/priority`, manager, { priority: "HIGH" })).status, 200);
    const assigned = await api("PATCH", `/requests/${request.id}/assign`, manager, { technicianId: tech.id });
    assert.equal((await assigned.json()).status, STATUS.ASSIGNED);

    // 3. technician sees it, starts it, leaves a note, resolves it
    const mine: { id: string; priority: string }[] = await (await api("GET", "/requests/assigned", tech)).json();
    assert.equal(mine.find((r) => r.id === request.id)?.priority, "HIGH", "technician sees it with the new priority");
    assert.equal((await api("PATCH", `/requests/${request.id}/status`, tech, { status: STATUS.IN_PROGRESS })).status, 200);
    assert.equal((await api("POST", `/requests/${request.id}/notes`, tech, { body: "Reset the breaker" })).status, 201);
    assert.equal((await api("PATCH", `/requests/${request.id}/status`, tech, { status: STATUS.RESOLVED })).status, 200);

    // 4. it leaves the manager's open list, and the customer sees it resolved with the note
    const open2: { id: string }[] = await (await api("GET", "/requests/open", manager)).json();
    assert.ok(!open2.some((r) => r.id === request.id), "resolved requests leave the open list");
    const myRequests: { id: string; status: string }[] = await (await api("GET", "/requests/mine", customer)).json();
    assert.equal(myRequests.find((r) => r.id === request.id)?.status, STATUS.RESOLVED);
    const detail = await (await api("GET", `/requests/${request.id}`, customer)).json();
    assert.equal(detail.notes[0].body, "Reset the breaker");

    // 5. the dashboard counted it, and it has a resolved time now
    const stored = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    assert.ok(stored.resolvedAt, "resolvedAt is set");
    const afterM = await (await api("GET", "/metrics", manager)).json();
    assert.ok(afterM.resolved >= before.resolved + 1);
    assert.notEqual(afterM.avgResolveHours, null);
  });
});

// ---- role access: every new page/API only works for the roles it's meant for ----
// these don't need the db - requireAuth/requireRole answer before any database lookup

describe("role access - the sprint 3 endpoints", () => {
  const endpoints: { method: string; path: string; allowed: string[]; body?: unknown }[] = [
    { method: "GET", path: "/users", allowed: ["ADMIN"] },
    { method: "POST", path: "/users", allowed: ["ADMIN"], body: {} },
    { method: "PATCH", path: `/users/${randomUUID()}/role`, allowed: ["ADMIN"], body: {} },
    { method: "PATCH", path: `/users/${randomUUID()}/active`, allowed: ["ADMIN"], body: {} },
    { method: "POST", path: "/categories", allowed: ["ADMIN"], body: {} },
    { method: "PATCH", path: "/categories/1", allowed: ["ADMIN"], body: {} },
    { method: "DELETE", path: "/categories/1", allowed: ["ADMIN"] },
    { method: "PATCH", path: `/requests/${randomUUID()}/priority`, allowed: ["MANAGER", "ADMIN"], body: {} },
    { method: "GET", path: "/metrics", allowed: ["MANAGER", "ADMIN"] },
  ];

  for (const e of endpoints) {
    test(`${e.method} ${e.path.replace(/[0-9a-f-]{36}/, ":id")} - 401 without a token`, async () => {
      assert.equal((await api(e.method, e.path, undefined, e.body)).status, 401);
    });

    for (const role of ["CUSTOMER", "TECHNICIAN", "MANAGER", "ADMIN"].filter((r) => !e.allowed.includes(r))) {
      test(`${e.method} ${e.path.replace(/[0-9a-f-]{36}/, ":id")} - ${role} gets 403`, async () => {
        assert.equal((await api(e.method, e.path, asRole(role), e.body)).status, 403);
      });
    }
  }
});

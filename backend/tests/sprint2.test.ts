// tests for sprint 2 (stories #4-#7), run with "npm test". the rules being tested are in docs/sprint-2-api.md
//
// same setup as the other test files: tests marked "needs db" get skipped unless postgres is running,
// migrated and seeded (see README). each test run makes its own users and requests and deletes them at
// the end, so it doesn't mess with the demo data.
//
// the #5 and #7 endpoints (assign, update status, add note) might not be built yet. if a route doesn't
// exist, its tests show up as "# TODO" instead of failing, and become real pass/fail tests once it does.
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
import { STATUS, canMoveTo, isOpen } from "../src/lib/status";

type Person = { id: string; name: string; email: string; role: string };
type ApiRequest = {
  id: string;
  title: string;
  status: string;
  priority: string;
  userId: string;
  assignedTechnicianId: string | null;
  user?: Record<string, unknown>;
  assignedTechnician?: Record<string, unknown> | null;
  category?: { name: string };
  notes?: { body: string; author: { id: string; name: string } }[];
};

let server: Server;
let baseUrl: string;
let dbReady = false;

// test users, made fresh each run
const run = Date.now();
let customer: Person; // submits the requests
let otherCustomer: Person;
let tech: Person;
let otherTech: Person;
let manager: Person;
let categoryId: number;

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

  customer = await makeUser("CUSTOMER", `Test Customer ${run}`);
  otherCustomer = await makeUser("CUSTOMER", `Other Customer ${run}`);
  tech = await makeUser("TECHNICIAN", `Test Tech ${run}`);
  otherTech = await makeUser("TECHNICIAN", `Other Tech ${run}`);
  manager = await makeUser("MANAGER", `Test Manager ${run}`);

  const category = await prisma.category.findFirst();
  assert.ok(category, "run npm run prisma:seed first");
  categoryId = category.id;
});

after(async () => {
  server.close();
  if (dbReady) {
    const ids = [customer, otherCustomer, tech, otherTech, manager].filter(Boolean).map((u) => u.id);
    // notes are deleted along with their requests (onDelete: Cascade)
    await prisma.note.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.request.deleteMany({
      where: { OR: [{ userId: { in: ids } }, { assignedTechnicianId: { in: ids } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
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

// make a request straight in the db, so each test starts from exactly the state it needs
let made = 0;
function makeRequest(data: {
  title?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status?: string;
  userId?: string;
  assignedTechnicianId?: string;
  createdAt?: Date;
}) {
  made++;
  return prisma.request.create({
    data: {
      title: data.title ?? `Test request ${run}-${made}`,
      description: "test",
      location: "test",
      priority: data.priority ?? "MEDIUM",
      status: data.status ?? STATUS.SUBMITTED,
      userId: data.userId ?? customer.id,
      categoryId,
      assignedTechnicianId: data.assignedTechnicianId,
      createdAt: data.createdAt,
    },
  });
}

// an assigned request, ready for the technician to work on (story #7 starting point)
function makeAssigned(status: string = STATUS.ASSIGNED) {
  return makeRequest({ assignedTechnicianId: tech.id, status });
}

// express answers unknown routes with an HTML "Cannot PATCH ..." page, our API always answers with JSON.
// so an HTML 404 means "this endpoint hasn't been built yet"
function routeMissing(res: Response) {
  return res.status === 404 && !(res.headers.get("content-type") ?? "").includes("application/json");
}

// for the #5/#7 tests: skip without a db, mark TODO if Almas's endpoint isn't there yet.
// returns true when the test should stop
function notReady(t: TestContext, res?: Response, what = "") {
  if (!dbReady) {
    t.skip("database not running");
    return true;
  }
  if (res && routeMissing(res)) {
    t.todo(`waiting for ${what} to be built`);
    return true;
  }
  return false;
}

function needsDb(t: TestContext) {
  if (!dbReady) t.skip("database not running");
  return !dbReady;
}

const fakeId = () => randomUUID();
const asRole = (role: string) => ({ id: "someone", role });

// ---- the shared status rules ----

describe("status rules (src/lib/status.ts)", () => {
  test("a technician can only move a request one step forward", () => {
    assert.equal(canMoveTo("Assigned", "In Progress"), true);
    assert.equal(canMoveTo("In Progress", "Resolved"), true);
    assert.equal(canMoveTo("Assigned", "Resolved"), false, "no skipping");
    assert.equal(canMoveTo("In Progress", "Assigned"), false, "no going backwards");
    assert.equal(canMoveTo("Resolved", "In Progress"), false, "no reopening");
    assert.equal(canMoveTo("Submitted", "In Progress"), false, "has to be assigned first");
    assert.equal(canMoveTo("Assigned", "Done"), false, "made up status");
  });

  test("only Resolved counts as closed", () => {
    assert.equal(isOpen("Submitted"), true);
    assert.equal(isOpen("Assigned"), true);
    assert.equal(isOpen("In Progress"), true);
    assert.equal(isOpen("Resolved"), false);
  });
});

// ---- story #4 ----

describe("story #4 - GET /requests/open (manager sees all open requests)", () => {
  test("without a token returns 401", async () => {
    assert.equal((await api("GET", "/requests/open")).status, 401);
  });

  for (const role of ["CUSTOMER", "TECHNICIAN"]) {
    test(`${role} gets 403`, async () => {
      assert.equal((await api("GET", "/requests/open", asRole(role))).status, 403);
    });
  }

  test("shows open requests from every user, but not resolved ones (needs db)", async (t) => {
    if (needsDb(t)) return;
    const mine = await makeRequest({ userId: customer.id });
    const theirs = await makeRequest({ userId: otherCustomer.id, assignedTechnicianId: tech.id, status: STATUS.IN_PROGRESS });
    const resolved = await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.RESOLVED });

    const res = await api("GET", "/requests/open", manager);
    assert.equal(res.status, 200);
    const list: ApiRequest[] = await res.json();
    const ids = list.map((r) => r.id);

    assert.ok(ids.includes(mine.id), "customer's request missing");
    assert.ok(ids.includes(theirs.id), "other customer's request missing");
    assert.ok(!ids.includes(resolved.id), "resolved requests should not be listed");
    assert.ok(list.every((r) => r.status !== STATUS.RESOLVED));
  });

  test("each request includes the submitter, category and assigned technician, without passwords (needs db)", async (t) => {
    if (needsDb(t)) return;
    const assigned = await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.ASSIGNED });
    const unassigned = await makeRequest({});

    const list: ApiRequest[] = await (await api("GET", "/requests/open", manager)).json();
    const a = list.find((r) => r.id === assigned.id)!;
    const u = list.find((r) => r.id === unassigned.id)!;

    assert.equal(a.user?.name, customer.name);
    assert.ok(a.category?.name);
    assert.equal(a.assignedTechnician?.name, tech.name);
    assert.equal(u.assignedTechnician, null, "unassigned requests have no technician yet");
    assert.equal(a.user?.password, undefined, "never send password hashes");
    assert.equal(a.assignedTechnician?.password, undefined, "never send password hashes");
  });

  test("most urgent first, then oldest first within the same priority (needs db)", async (t) => {
    if (needsDb(t)) return;
    const low = await makeRequest({ priority: "LOW", createdAt: new Date("2026-01-01") });
    const highOld = await makeRequest({ priority: "HIGH", createdAt: new Date("2026-01-02") });
    const highNew = await makeRequest({ priority: "HIGH", createdAt: new Date("2026-01-05") });
    const urgent = await makeRequest({ priority: "URGENT", createdAt: new Date("2026-01-09") });

    const list: ApiRequest[] = await (await api("GET", "/requests/open", manager)).json();
    const ids = list.map((r) => r.id);
    const order = [urgent, highOld, highNew, low].map((r) => ids.indexOf(r.id));
    assert.ok(order.every((pos) => pos >= 0), "all four should be listed");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "expected URGENT, HIGH (older), HIGH (newer), LOW");
  });

  test("ADMIN can see it too (needs db)", async (t) => {
    if (needsDb(t)) return;
    assert.equal((await api("GET", "/requests/open", { id: "admin", role: "ADMIN" })).status, 200);
  });
});

// ---- story #6 ----

describe("story #6 - GET /requests/assigned (technician sees their assigned requests)", () => {
  test("without a token returns 401", async () => {
    assert.equal((await api("GET", "/requests/assigned")).status, 401);
  });

  for (const role of ["CUSTOMER", "MANAGER"]) {
    test(`${role} gets 403`, async () => {
      assert.equal((await api("GET", "/requests/assigned", asRole(role))).status, 403);
    });
  }

  test("only shows requests assigned to me - not another technician's, not unassigned ones (needs db)", async (t) => {
    if (needsDb(t)) return;
    const mine = await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.ASSIGNED });
    const theirs = await makeRequest({ assignedTechnicianId: otherTech.id, status: STATUS.ASSIGNED });
    const nobodys = await makeRequest({});

    const res = await api("GET", "/requests/assigned", tech);
    assert.equal(res.status, 200);
    const list: ApiRequest[] = await res.json();
    const ids = list.map((r) => r.id);

    assert.ok(ids.includes(mine.id));
    assert.ok(!ids.includes(theirs.id), "should not see another technician's request");
    assert.ok(!ids.includes(nobodys.id), "should not see unassigned requests");
    assert.ok(list.every((r) => r.assignedTechnicianId === tech.id));

    const found = list.find((r) => r.id === mine.id)!;
    assert.equal(found.user?.name, customer.name, "shows who submitted it");
    assert.ok(found.category?.name, "shows the category");
    assert.equal(found.user?.password, undefined, "never send password hashes");
  });

  test("unfinished work comes first, by urgency; resolved ones go to the bottom (needs db)", async (t) => {
    if (needsDb(t)) return;
    const resolvedUrgent = await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.RESOLVED, priority: "URGENT" });
    const lowInProgress = await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.IN_PROGRESS, priority: "LOW" });
    const highAssigned = await makeRequest({ assignedTechnicianId: tech.id, status: STATUS.ASSIGNED, priority: "HIGH" });

    const list: ApiRequest[] = await (await api("GET", "/requests/assigned", tech)).json();
    const ids = list.map((r) => r.id);
    const order = [highAssigned, lowInProgress, resolvedUrgent].map((r) => ids.indexOf(r.id));
    assert.ok(order.every((pos) => pos >= 0), "all three should be listed");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "expected HIGH open, LOW open, then resolved");
  });

  test("a technician with nothing assigned gets an empty list (needs db)", async (t) => {
    if (needsDb(t)) return;
    const res = await api("GET", "/requests/assigned", { id: fakeId(), role: "TECHNICIAN" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });
});

// ---- request detail (used by the #7 detail page) ----

describe("GET /requests/:id (request detail with notes)", () => {
  test("without a token returns 401", async () => {
    assert.equal((await api("GET", `/requests/${fakeId()}`)).status, 401);
  });

  test("the submitter, the assigned technician and managers can see it, with notes oldest first (needs db)", async (t) => {
    if (needsDb(t)) return;
    const request = await makeAssigned(STATUS.IN_PROGRESS);
    await prisma.note.create({ data: { body: "first note", requestId: request.id, authorId: tech.id, createdAt: new Date("2026-02-01") } });
    await prisma.note.create({ data: { body: "second note", requestId: request.id, authorId: manager.id, createdAt: new Date("2026-02-02") } });

    for (const who of [customer, tech, manager]) {
      const res = await api("GET", `/requests/${request.id}`, who);
      assert.equal(res.status, 200, `${who.role} should be able to see it`);
      const body: ApiRequest = await res.json();
      assert.equal(body.id, request.id);
      assert.deepEqual(body.notes?.map((n) => n.body), ["first note", "second note"]);
      assert.equal(body.notes?.[0].author.name, tech.name);
      assert.equal(body.assignedTechnician?.name, tech.name);
    }
  });

  test("another customer or another technician gets 403 (needs db)", async (t) => {
    if (needsDb(t)) return;
    const request = await makeAssigned();
    assert.equal((await api("GET", `/requests/${request.id}`, otherCustomer)).status, 403);
    assert.equal((await api("GET", `/requests/${request.id}`, otherTech)).status, 403);
  });

  test("a request that doesn't exist returns 404 (needs db)", async (t) => {
    if (needsDb(t)) return;
    assert.equal((await api("GET", `/requests/${fakeId()}`, manager)).status, 404);
  });
});

// ---- technicians list (for the #5 dropdown) ----

describe("GET /users/technicians (assign dropdown)", () => {
  for (const role of ["CUSTOMER", "TECHNICIAN"]) {
    test(`${role} gets 403`, async () => {
      assert.equal((await api("GET", "/users/technicians", asRole(role))).status, 403);
    });
  }

  test("a manager gets every technician and nobody else, without passwords (needs db)", async (t) => {
    if (needsDb(t)) return;
    const res = await api("GET", "/users/technicians", manager);
    assert.equal(res.status, 200);
    const list: Record<string, unknown>[] = await res.json();
    const ids = list.map((u) => u.id);

    assert.ok(ids.includes(tech.id) && ids.includes(otherTech.id));
    assert.ok(!ids.includes(customer.id) && !ids.includes(manager.id), "only technicians");
    assert.ok(list.every((u) => u.password === undefined), "never send password hashes");
  });
});

// ---- story #5 (Almas's endpoint) ----

describe("story #5 - PATCH /requests/:id/assign (manager assigns to a technician)", () => {
  const assign = (id: string, as: { id: string; role: string }, body: unknown) =>
    api("PATCH", `/requests/${id}/assign`, as, body);
  const WHAT = "the assign API (PATCH /requests/:id/assign)";

  test("assigning sets the technician and status Assigned, and it shows up in their list (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeRequest({});
    const res = await assign(request.id, manager, { technicianId: tech.id });
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 200);
    const body: ApiRequest = await res.json();
    assert.equal(body.status, STATUS.ASSIGNED);
    assert.equal(body.assignedTechnicianId, tech.id);
    assert.equal(body.assignedTechnician?.name, tech.name);

    const techList: ApiRequest[] = await (await api("GET", "/requests/assigned", tech)).json();
    assert.ok(techList.some((r) => r.id === request.id), "should be in the technician's list now");
  });

  test("reassigning moves it to the other technician (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned();
    const res = await assign(request.id, manager, { technicianId: otherTech.id });
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 200);
    const oldList: ApiRequest[] = await (await api("GET", "/requests/assigned", tech)).json();
    const newList: ApiRequest[] = await (await api("GET", "/requests/assigned", otherTech)).json();
    assert.ok(!oldList.some((r) => r.id === request.id), "should leave the first technician's list");
    assert.ok(newList.some((r) => r.id === request.id), "should be in the new technician's list");
  });

  test("assigning to someone who isn't a technician returns 400 and changes nothing (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeRequest({});
    const res = await assign(request.id, manager, { technicianId: otherCustomer.id });
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 400);
    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(after.assignedTechnicianId, null);
    assert.equal(after.status, STATUS.SUBMITTED);
  });

  test("a resolved request can't be reassigned (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned(STATUS.RESOLVED);
    const res = await assign(request.id, manager, { technicianId: otherTech.id });
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 400);
    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(after.status, STATUS.RESOLVED);
    assert.equal(after.assignedTechnicianId, tech.id);
  });

  test("missing technicianId returns 400 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeRequest({});
    const res = await assign(request.id, manager, {});
    if (notReady(t, res, WHAT)) return;
    assert.equal(res.status, 400);
  });

  test("a request that doesn't exist returns 404 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const res = await assign(fakeId(), manager, { technicianId: tech.id });
    if (notReady(t, res, WHAT)) return;
    assert.equal(res.status, 404);
  });

  test("customers and technicians get 403 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeRequest({});
    const res = await assign(request.id, customer, { technicianId: tech.id });
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 403);
    assert.equal((await assign(request.id, tech, { technicianId: tech.id })).status, 403);
  });
});

// ---- story #7 (Almas's endpoints) ----

describe("story #7 - PATCH /requests/:id/status (technician updates status)", () => {
  const setStatus = (id: string, as: { id: string; role: string }, status: string) =>
    api("PATCH", `/requests/${id}/status`, as, { status });
  const WHAT = "the update-status API (PATCH /requests/:id/status)";

  test("Assigned -> In Progress -> Resolved, then it drops off the open list (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned();

    const first = await setStatus(request.id, tech, STATUS.IN_PROGRESS);
    if (notReady(t, first, WHAT)) return;
    assert.equal(first.status, 200);
    assert.equal((await first.json()).status, STATUS.IN_PROGRESS);

    const second = await setStatus(request.id, tech, STATUS.RESOLVED);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).status, STATUS.RESOLVED);

    const open: ApiRequest[] = await (await api("GET", "/requests/open", manager)).json();
    assert.ok(!open.some((r) => r.id === request.id), "resolved requests leave the manager's open list");

    const mine: ApiRequest[] = await (await api("GET", "/requests/mine", customer)).json();
    assert.equal(mine.find((r) => r.id === request.id)?.status, STATUS.RESOLVED, "the customer sees it resolved");
  });

  for (const [from, to, why] of [
    [STATUS.ASSIGNED, STATUS.RESOLVED, "skipping In Progress"],
    [STATUS.IN_PROGRESS, STATUS.ASSIGNED, "going backwards"],
    [STATUS.ASSIGNED, "Done", "a made up status"],
  ]) {
    test(`${why} (${from} -> ${to}) returns 400 and changes nothing (needs db)`, async (t) => {
      if (!dbReady) return t.skip("database not running");
      const request = await makeAssigned(from);
      const res = await setStatus(request.id, tech, to);
      if (notReady(t, res, WHAT)) return;

      assert.equal(res.status, 400);
      const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
      assert.equal(after.status, from);
    });
  }

  test("another technician or a customer gets 403 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned();
    const res = await setStatus(request.id, otherTech, STATUS.IN_PROGRESS);
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 403, "only the assigned technician can update it");
    assert.equal((await setStatus(request.id, customer, STATUS.IN_PROGRESS)).status, 403);
  });

  test("a request that doesn't exist returns 404 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const res = await setStatus(fakeId(), tech, STATUS.IN_PROGRESS);
    if (notReady(t, res, WHAT)) return;
    assert.equal(res.status, 404);
  });
});

describe("story #7 - POST /requests/:id/notes (add a progress note)", () => {
  const addNote = (id: string, as: { id: string; role: string }, body: unknown) =>
    api("POST", `/requests/${id}/notes`, as, body);
  const WHAT = "the add-note API (POST /requests/:id/notes)";

  test("the assigned technician adds a note and the customer can see it (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned(STATUS.IN_PROGRESS);
    const res = await addNote(request.id, tech, { body: "  Replaced the valve, testing now  " });
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 201);
    const note = await res.json();
    assert.equal(note.body, "Replaced the valve, testing now", "should be trimmed");
    assert.equal(note.author?.name, tech.name);

    // "so that everyone sees progress" - the person who submitted it can read it
    const detail: ApiRequest = await (await api("GET", `/requests/${request.id}`, customer)).json();
    assert.ok(detail.notes?.some((n) => n.body === "Replaced the valve, testing now"));
  });

  test("a manager can add a note too (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned();
    const res = await addNote(request.id, manager, { body: "Please prioritise this one" });
    if (notReady(t, res, WHAT)) return;
    assert.equal(res.status, 201);
  });

  test("an empty note returns 400 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned();
    const res = await addNote(request.id, tech, { body: "   " });
    if (notReady(t, res, WHAT)) return;
    assert.equal(res.status, 400);
  });

  test("another technician or a customer gets 403 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const request = await makeAssigned();
    const res = await addNote(request.id, otherTech, { body: "not my job" });
    if (notReady(t, res, WHAT)) return;

    assert.equal(res.status, 403);
    assert.equal((await addNote(request.id, customer, { body: "any update?" })).status, 403);
  });

  test("a request that doesn't exist returns 404 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");
    const res = await addNote(fakeId(), tech, { body: "hello" });
    if (notReady(t, res, WHAT)) return;
    assert.equal(res.status, 404);
  });
});

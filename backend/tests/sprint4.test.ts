// tests for sprint 4, run with "npm test":
//   #15 customers don't choose priority      #16 automatic priority scoring
//   #8  notifications (the bell)
//
// same setup as the other test files: tests marked "needs db" get skipped unless postgres is running,
// migrated and seeded. each run makes its own users/requests and deletes them at the end
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
import { scoreRequest, priorityForScore } from "../src/lib/priorityScore";

type Person = { id: string; name: string; email: string; role: string };

let server: Server;
let baseUrl: string;
let dbReady = false;

const run = Date.now();
let customer: Person;
let otherCustomer: Person;
let tech: Person;
let manager: Person;
const categoryIds: Record<string, number> = {};

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

  customer = await makeUser("CUSTOMER", `S4 Customer ${run}`);
  otherCustomer = await makeUser("CUSTOMER", `S4 Other ${run}`);
  tech = await makeUser("TECHNICIAN", `S4 Tech ${run}`);
  manager = await makeUser("MANAGER", `S4 Manager ${run}`);

  for (const c of await prisma.category.findMany()) categoryIds[c.name] = c.id;
  assert.ok(categoryIds.Electrical && categoryIds.IT, "run npm run prisma:seed first");
});

after(async () => {
  server.close();
  if (dbReady) {
    const ids = [customer, otherCustomer, tech, manager].filter(Boolean).map((u) => u.id);
    // notifications and notes go with their requests/users (onDelete: Cascade)
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

// the customer submits through the API, the way the form does
async function submit(fields: { title: string; description: string; category: string; priority?: string }) {
  const res = await api("POST", "/requests", customer, {
    title: `${fields.title} ${run}`,
    description: fields.description,
    location: "Room 1",
    categoryId: categoryIds[fields.category],
    ...(fields.priority ? { priority: fields.priority } : {}),
  });
  assert.equal(res.status, 201);
  return res.json();
}

function needsDb(t: TestContext) {
  if (!dbReady) t.skip("database not running");
  return !dbReady;
}

async function bell(user: Person) {
  const res = await api("GET", "/notifications", user);
  assert.equal(res.status, 200);
  return (await res.json()) as { unreadCount: number; notifications: { id: string; message: string; read: boolean; requestId: string }[] };
}

const DAY = 86_400_000;

// ---- story #16: the scoring rules on their own (no db needed) ----

describe("story #16 - the scoring rules (src/lib/priorityScore.ts)", () => {
  test("sparks in an electrical request is URGENT", () => {
    const r = scoreRequest({ categoryName: "Electrical", title: "Outlet sparks", description: "Sparks when I plug in" });
    assert.equal(r.score, 70); // Electrical 30 + safety 40
    assert.equal(r.priority, "URGENT");
    assert.deepEqual(r.reasons, ["Electrical +30", '"sparks" (safety) +40']);
  });

  test("a plumbing leak is HIGH", () => {
    const r = scoreRequest({ categoryName: "Plumbing", title: "Sink", description: "It's leaking under the sink" });
    assert.equal(r.score, 50); // Plumbing 30 + disruption 20
    assert.equal(r.priority, "HIGH");
  });

  test("a plain IT request is LOW", () => {
    const r = scoreRequest({ categoryName: "IT", title: "New mouse", description: "Could I get a wireless mouse" });
    assert.equal(r.score, 10);
    assert.equal(r.priority, "LOW");
  });

  test("waiting adds 2 points a day, up to 20", () => {
    const createdAt = new Date("2026-11-01T09:00:00Z");
    const after5 = scoreRequest({ categoryName: "IT", title: "x", description: "y", createdAt, now: new Date(createdAt.getTime() + 5 * DAY) });
    assert.equal(after5.score, 20); // 10 + 5 days * 2
    assert.equal(after5.priority, "MEDIUM", "a LOW request moves up after waiting");
    assert.ok(after5.reasons.includes("waiting 5 days +10"));

    const after30 = scoreRequest({ categoryName: "IT", title: "x", description: "y", createdAt, now: new Date(createdAt.getTime() + 30 * DAY) });
    assert.equal(after30.score, 30, "waiting is capped at +20");
  });

  test("each word group counts once, words must be whole words, the score caps at 100", () => {
    const many = scoreRequest({ categoryName: "Electrical", title: "fire smoke sparks gas", description: "leak flood no power broken" });
    assert.equal(many.score, 90); // 30 + 40 + 20, not one bonus per word
    const gasket = scoreRequest({ categoryName: "Plumbing", title: "Gasket", description: "replace the gasket" });
    assert.equal(gasket.score, 30, '"gasket" doesn\'t count as "gas"');
    const capped = scoreRequest({ categoryName: "Electrical", title: "fire", description: "leak", createdAt: new Date(0) });
    assert.equal(capped.score, 100);
  });

  test("categories the admin adds later get the default 15 points", () => {
    assert.equal(scoreRequest({ categoryName: "Carpentry", title: "x", description: "y" }).score, 15);
  });

  test("score -> priority boundaries", () => {
    assert.equal(priorityForScore(0), "LOW");
    assert.equal(priorityForScore(19), "LOW");
    assert.equal(priorityForScore(20), "MEDIUM");
    assert.equal(priorityForScore(40), "HIGH");
    assert.equal(priorityForScore(60), "URGENT");
  });
});

// ---- stories #15 + #16 through the API ----

describe("stories #15 and #16 - priority is scored, not chosen by the customer", () => {
  test("a customer asking for URGENT on a minor request still gets LOW (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Keyboard", description: "A key is a bit sticky", category: "IT", priority: "URGENT" });
    assert.equal(created.priority, "LOW", "the customer's URGENT is ignored");
    assert.equal(created.priorityScore, 10);
    assert.deepEqual(created.scoreReasons, ["IT +10"]);
  });

  test("a dangerous request is scored URGENT and goes to the top of the manager's list (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Panel", description: "Burning smell and sparks from the panel", category: "Electrical" });
    assert.equal(created.priority, "URGENT");

    const open: { id: string; priority: string; priorityScore: number | null; scoreReasons: string[] }[] =
      await (await api("GET", "/requests/open", manager)).json();
    const mine = open.find((r) => r.id === created.id)!;
    assert.ok(mine, "on the open list");
    assert.ok(mine.scoreReasons.length >= 2, "the manager can see why it scored that way");
    const firstNonUrgent = open.findIndex((r) => r.priority !== "URGENT");
    const position = open.indexOf(mine);
    assert.ok(firstNonUrgent === -1 || position < firstNonUrgent, "among the URGENT ones at the top");
  });

  test("a request that waits moves up a priority on its own (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Monitor", description: "Second monitor please", category: "IT" });
    assert.equal(created.priority, "LOW");
    // pretend it was submitted 6 days ago
    await prisma.request.update({ where: { id: created.id }, data: { createdAt: new Date(Date.now() - 6 * DAY) } });

    const open: { id: string; priority: string; priorityScore: number }[] = await (await api("GET", "/requests/open", manager)).json();
    const now = open.find((r) => r.id === created.id)!;
    assert.equal(now.priorityScore, 22); // 10 + 6 days * 2
    assert.equal(now.priority, "MEDIUM");
  });

  test("once a manager sets the priority, the score stops changing it (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Printer", description: "Printer is slow", category: "IT" });
    assert.equal((await api("PATCH", `/requests/${created.id}/priority`, manager, { priority: "HIGH" })).status, 200);
    await prisma.request.update({ where: { id: created.id }, data: { createdAt: new Date(Date.now() - 20 * DAY) } });

    const detail = await (await api("GET", `/requests/${created.id}`, manager)).json();
    assert.equal(detail.priority, "HIGH", "stays what the manager picked");
    assert.equal(detail.priorityOverridden, true);
  });

  test("requests from before sprint 4 (no score) keep their priority (needs db)", async (t) => {
    if (needsDb(t)) return;
    const old = await prisma.request.create({
      data: { title: `Old ${run}`, description: "x", location: "x", priority: "URGENT", userId: customer.id, categoryId: categoryIds.IT, createdAt: new Date(Date.now() - 30 * DAY) },
    });
    await api("GET", "/requests/open", manager); // triggers the re-scoring
    const after = await prisma.request.findUniqueOrThrow({ where: { id: old.id } });
    assert.equal(after.priority, "URGENT");
    assert.equal(after.priorityScore, null);
  });
});

// ---- story #8: notifications ----

describe("story #8 - notifications", () => {
  test("assigning notifies the customer and the technician, not the manager (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Door", description: "Door handle is loose", category: "Other" });
    const before = (await bell(customer)).unreadCount;
    assert.equal((await api("PATCH", `/requests/${created.id}/assign`, manager, { technicianId: tech.id })).status, 200);

    const c = await bell(customer);
    assert.equal(c.unreadCount, before + 1);
    assert.match(c.notifications[0].message, /was assigned to S4 Tech/);
    assert.equal(c.notifications[0].requestId, created.id);

    const tb = await bell(tech);
    assert.ok(tb.notifications.some((n) => n.requestId === created.id && /New request assigned to you/.test(n.message)));

    const mb = await bell(manager);
    assert.ok(!mb.notifications.some((n) => n.requestId === created.id), "whoever made the change isn't notified");
  });

  test("every status change notifies the customer (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Light", description: "Light flickers", category: "Electrical" });
    await api("PATCH", `/requests/${created.id}/assign`, manager, { technicianId: tech.id });
    await api("PATCH", `/requests/${created.id}/status`, tech, { status: STATUS.IN_PROGRESS });
    await api("PATCH", `/requests/${created.id}/status`, tech, { status: STATUS.RESOLVED });

    const messages = (await bell(customer)).notifications.filter((n) => n.requestId === created.id).map((n) => n.message);
    assert.ok(messages.some((m) => m.endsWith("is now In Progress.")));
    assert.ok(messages.some((m) => m.endsWith("is now Resolved.")));
    assert.equal(messages.length, 3, "assigned + in progress + resolved");
  });

  test("a technician's note notifies the customer (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Fan", description: "Fan is noisy", category: "HVAC" });
    await api("PATCH", `/requests/${created.id}/assign`, manager, { technicianId: tech.id });
    await api("POST", `/requests/${created.id}/notes`, tech, { body: "Ordered a new fan" });
    const c = await bell(customer);
    assert.match(c.notifications[0].message, /S4 Tech .* added a note/);
  });

  test("you only see your own notifications (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Window", description: "Window won't close", category: "Other" });
    await api("PATCH", `/requests/${created.id}/assign`, manager, { technicianId: tech.id });
    const other = await bell(otherCustomer);
    assert.ok(!other.notifications.some((n) => n.requestId === created.id));
  });

  test("marking one as read lowers the unread count; you can't mark someone else's (needs db)", async (t) => {
    if (needsDb(t)) return;
    const created = await submit({ title: "Tap", description: "Tap drips", category: "Plumbing" });
    await api("PATCH", `/requests/${created.id}/assign`, manager, { technicianId: tech.id });
    const before = await bell(customer);
    const target = before.notifications.find((n) => n.requestId === created.id && !n.read)!;

    assert.equal((await api("PATCH", `/notifications/${target.id}/read`, otherCustomer)).status, 403, "not yours");
    assert.equal((await api("PATCH", `/notifications/${randomUUID()}/read`, customer)).status, 404);

    const res = await api("PATCH", `/notifications/${target.id}/read`, customer);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).read, true);
    assert.equal((await bell(customer)).unreadCount, before.unreadCount - 1);
  });

  test("mark all as read clears the count (needs db)", async (t) => {
    if (needsDb(t)) return;
    assert.equal((await api("PATCH", "/notifications/read-all", customer)).status, 200);
    assert.equal((await bell(customer)).unreadCount, 0);
  });

  test("the notification endpoints need a login", async () => {
    assert.equal((await api("GET", "/notifications")).status, 401);
    assert.equal((await api("PATCH", "/notifications/read-all")).status, 401);
    assert.equal((await api("PATCH", `/notifications/${randomUUID()}/read`)).status, 401);
  });
});

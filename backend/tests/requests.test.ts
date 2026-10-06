// tests for story #2 (submit a maintenance request) and story #3 (view my requests), run with "npm test"
// uses node's built in test runner so we didn't need to install jest or anything
//
// the validation and auth tests work without a database.
// the tests marked "needs db" get skipped unless postgres is running and seeded
// (docker compose up -d, npx prisma migrate dev, npm run prisma:seed)
import "dotenv/config";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET ??= "test-secret";

import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { createRequestSchema } from "../src/routes/requests";

const validRequest = {
  title: "Leaking sink",
  description: "The sink in the 2nd floor kitchen is leaking onto the floor",
  location: "Building A, room 204",
  categoryId: 1,
  priority: "HIGH",
};

describe("createRequestSchema (validation rules)", () => {
  test("accepts a valid request", () => {
    assert.equal(createRequestSchema.safeParse(validRequest).success, true);
  });

  test("rejects a missing title", () => {
    const { title, ...noTitle } = validRequest;
    assert.equal(createRequestSchema.safeParse(noTitle).success, false);
  });

  test("rejects a description that is only spaces", () => {
    const result = createRequestSchema.safeParse({ ...validRequest, description: "   " });
    assert.equal(result.success, false);
  });

  test("rejects a missing location", () => {
    const result = createRequestSchema.safeParse({ ...validRequest, location: "" });
    assert.equal(result.success, false);
  });

  test("rejects a priority that isn't LOW/MEDIUM/HIGH/URGENT", () => {
    const result = createRequestSchema.safeParse({ ...validRequest, priority: "SUPER_URGENT" });
    assert.equal(result.success, false);
  });

  test("accepts all four priorities", () => {
    for (const priority of ["LOW", "MEDIUM", "HIGH", "URGENT"]) {
      assert.equal(createRequestSchema.safeParse({ ...validRequest, priority }).success, true);
    }
  });

  test("rejects a categoryId that isn't a number", () => {
    const result = createRequestSchema.safeParse({ ...validRequest, categoryId: "Plumbing" });
    assert.equal(result.success, false);
  });
});

describe("API routes", () => {
  let server: Server;
  let baseUrl: string;
  let dbReady = false;

  before(async () => {
    // port 0 = let the OS pick a free port so we don't clash with npm run dev
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api`;

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      console.log("database not reachable, skipping the tests that need it");
    }
  });

  after(async () => {
    server.close();
    await prisma.$disconnect();
  });

  function tokenFor(userId: string) {
    return jwt.sign({ userId, role: "CUSTOMER" }, process.env.JWT_SECRET as string);
  }

  function postRequest(body: unknown, token?: string) {
    return fetch(`${baseUrl}/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  test("POST /requests without a token returns 401", async () => {
    const res = await postRequest(validRequest);
    assert.equal(res.status, 401);
  });

  test("POST /requests with a fake token returns 401", async () => {
    const res = await postRequest(validRequest, "not-a-real-token");
    assert.equal(res.status, 401);
  });

  test("POST /requests with a token signed by the wrong secret returns 401", async () => {
    const forged = jwt.sign({ userId: "someone", role: "ADMIN" }, "wrong-secret");
    const res = await postRequest(validRequest, forged);
    assert.equal(res.status, 401);
  });

  test("POST /requests with invalid data returns 400 and an error message", async () => {
    const res = await postRequest({ ...validRequest, title: "" }, tokenFor("any-user"));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "Title is required");
  });

  test("GET /categories without a token returns 401", async () => {
    const res = await fetch(`${baseUrl}/categories`);
    assert.equal(res.status, 401);
  });

  test("GET /categories returns the seeded categories (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    const res = await fetch(`${baseUrl}/categories`, {
      headers: { Authorization: `Bearer ${tokenFor("any-user")}` },
    });
    assert.equal(res.status, 200);
    const names = (await res.json()).map((c: { name: string }) => c.name);
    for (const expected of ["Electrical", "Plumbing", "HVAC", "IT"]) {
      assert.ok(names.includes(expected), `missing category ${expected}`);
    }
  });

  test("POST /requests with a category that doesn't exist returns 400 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    const res = await postRequest({ ...validRequest, categoryId: 999999 }, tokenFor("any-user"));
    assert.equal(res.status, 400);
  });

  test("POST /requests creates the request with status Submitted (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    // use the demo user from prisma/seed.ts
    const user = await prisma.user.findUnique({ where: { email: "customer@demo.com" } });
    const category = await prisma.category.findFirst();
    assert.ok(user && category, "run npm run prisma:seed first");

    // try to sneak in a different userId and status - the API should ignore both
    const res = await postRequest(
      { ...validRequest, categoryId: category.id, userId: "someone-else", status: "Resolved" },
      tokenFor(user.id)
    );
    assert.equal(res.status, 201);

    const created = await res.json();
    assert.equal(created.title, validRequest.title);
    assert.equal(created.priority, "HIGH");
    assert.equal(created.status, "Submitted");
    assert.equal(created.userId, user.id);
    assert.equal(created.category.id, category.id);

    // clean up so the test doesn't leave junk in the db
    await prisma.request.delete({ where: { id: created.id } });
  });

  // ---- story #3 (view my requests and status) ----

  function getMine(token?: string) {
    return fetch(`${baseUrl}/requests/mine`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  test("GET /requests/mine without a token returns 401", async () => {
    const res = await getMine();
    assert.equal(res.status, 401);
  });

  test("GET /requests/mine with a fake token returns 401", async () => {
    const res = await getMine("not-a-real-token");
    assert.equal(res.status, 401);
  });

  test("GET /requests/mine for a user with no requests returns an empty list (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    const res = await getMine(tokenFor("user-with-no-requests"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });

  test("GET /requests/mine returns only my requests, newest first, with status and category (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    const me = await prisma.user.findUnique({ where: { email: "customer@demo.com" } });
    const category = await prisma.category.findFirst();
    assert.ok(me && category, "run npm run prisma:seed first");

    // a second user, so we can check their request doesn't show up in my list
    const someoneElse = await prisma.user.create({
      data: { email: `other-${Date.now()}@test.com`, password: "x", name: "Other Person" },
    });

    const base = { description: "test", location: "test", categoryId: category.id };
    const older = await prisma.request.create({
      data: { ...base, title: "Older one", userId: me.id, createdAt: new Date("2026-01-01") },
    });
    const newer = await prisma.request.create({
      data: { ...base, title: "Newer one", userId: me.id, status: "In Progress" },
    });
    const notMine = await prisma.request.create({
      data: { ...base, title: "Not mine", userId: someoneElse.id },
    });

    try {
      const res = await getMine(tokenFor(me.id));
      assert.equal(res.status, 200);
      const list: { id: string; title: string; status: string; userId: string; category: { name: string } }[] =
        await res.json();

      const ids = list.map((r) => r.id);
      assert.ok(!ids.includes(notMine.id), "should not see another user's request");
      assert.ok(list.every((r) => r.userId === me.id), "every request should be mine");

      // newest first
      assert.ok(ids.indexOf(newer.id) < ids.indexOf(older.id), "newest request should come first");

      const newerFromApi = list.find((r) => r.id === newer.id)!;
      assert.equal(newerFromApi.status, "In Progress");
      assert.equal(newerFromApi.category.name, category.name);

      const olderFromApi = list.find((r) => r.id === older.id)!;
      assert.equal(olderFromApi.status, "Submitted");
    } finally {
      // clean up so the test doesn't leave junk in the db
      await prisma.request.deleteMany({ where: { id: { in: [older.id, newer.id, notMine.id] } } });
      await prisma.user.delete({ where: { id: someoneElse.id } });
    }
  });
});

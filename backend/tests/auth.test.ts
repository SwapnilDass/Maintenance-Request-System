// tests for story #1 (log in with my role so I only see features meant for me), run with "npm test"
// same setup as requests.test.ts - the tests marked "needs db" get skipped unless postgres is running and seeded
import "dotenv/config";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET ??= "test-secret";

import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("story #1 - login and roles", () => {
  let server: Server;
  let baseUrl: string;
  let dbReady = false;

  before(async () => {
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

  function login(body: unknown) {
    return fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function tokenFor(userId: string, role: string) {
    return jwt.sign({ userId, role }, process.env.JWT_SECRET as string);
  }

  // ---- login ----

  test("POST /auth/login with no body returns 400", async () => {
    const res = await login({});
    assert.equal(res.status, 400);
  });

  test("POST /auth/login with an invalid email returns 400", async () => {
    const res = await login({ email: "not-an-email", password: "password123" });
    assert.equal(res.status, 400);
  });

  test("POST /auth/login with an unknown email returns 401 (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    const res = await login({ email: "nobody@demo.com", password: "password123" });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Invalid email or password");
  });

  test("POST /auth/login with the wrong password returns the same 401 message (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    const res = await login({ email: "customer@demo.com", password: "wrong-password" });
    assert.equal(res.status, 401);
    // same message as unknown email so nobody can tell which emails are registered
    assert.equal((await res.json()).error, "Invalid email or password");
  });

  for (const [email, role] of [
    ["customer@demo.com", "CUSTOMER"],
    ["tech@demo.com", "TECHNICIAN"],
    ["manager@demo.com", "MANAGER"],
    ["admin@demo.com", "ADMIN"],
  ]) {
    test(`${role} can log in and the token carries their role (needs db)`, async (t) => {
      if (!dbReady) return t.skip("database not running");

      const res = await login({ email, password: "password123" });
      assert.equal(res.status, 200, "run npm run prisma:seed first");
      const body = await res.json();

      assert.equal(body.user.email, email);
      assert.equal(body.user.role, role);
      assert.equal(body.user.password, undefined, "never send the password hash back");

      const payload = jwt.verify(body.token, process.env.JWT_SECRET as string) as { role: string };
      assert.equal(payload.role, role);
    });
  }

  // ---- /auth/me ----

  test("GET /auth/me without a token returns 401", async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    assert.equal(res.status, 401);
  });

  test("GET /auth/me with an expired token returns 401", async () => {
    const expired = jwt.sign({ userId: "x", role: "CUSTOMER" }, process.env.JWT_SECRET as string, {
      expiresIn: -10,
    });
    const res = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${expired}` } });
    assert.equal(res.status, 401);
  });

  test("GET /auth/me returns the logged in user (needs db)", async (t) => {
    if (!dbReady) return t.skip("database not running");

    const loginRes = await login({ email: "tech@demo.com", password: "password123" });
    const { token } = await loginRes.json();

    const res = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const me = await res.json();
    assert.equal(me.email, "tech@demo.com");
    assert.equal(me.role, "TECHNICIAN");
    assert.equal(me.password, undefined);
  });

  // ---- role-based access ----
  // these don't need the db because requireRole blocks the request before it gets that far

  for (const role of ["TECHNICIAN", "MANAGER", "ADMIN"]) {
    test(`${role} gets 403 when submitting a request`, async () => {
      const res = await fetch(`${baseUrl}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor("x", role)}` },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 403);
    });

    test(`${role} gets 403 on GET /requests/mine`, async () => {
      const res = await fetch(`${baseUrl}/requests/mine`, {
        headers: { Authorization: `Bearer ${tokenFor("x", role)}` },
      });
      assert.equal(res.status, 403);
    });
  }

  test("a token with a made up role gets 403", async () => {
    const res = await fetch(`${baseUrl}/requests/mine`, {
      headers: { Authorization: `Bearer ${tokenFor("x", "SUPERUSER")}` },
    });
    assert.equal(res.status, 403);
  });

  test("CUSTOMER gets past the role check (400 from validation, not 403)", async () => {
    const res = await fetch(`${baseUrl}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenFor("x", "CUSTOMER")}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

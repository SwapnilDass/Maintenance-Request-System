// user routes - everything here is under /api/users (see app.ts)
//
//   GET   /api/users/technicians      active technicians for the manager's assign dropdown (story #5)
//   GET   /api/users                  admin: every user (story #9)
//   POST  /api/users                  admin: add a user (story #9)
//   PATCH /api/users/:id/role         admin: change someone's role (story #9)
//   PATCH /api/users/:id/active       admin: deactivate ("remove") or reactivate a user (story #9)
//
// users are never deleted - deactivating keeps their old requests and notes, and stops them logging in
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

const ROLES = ["CUSTOMER", "TECHNICIAN", "MANAGER", "ADMIN"] as const;

// what the admin page sees about a user - never the password hash
const userFields = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

// ===== GET /api/users/technicians - for the assign dropdown (story #5) =====
// deactivated technicians are left out so nobody assigns work to them
router.get("/technicians", requireAuth, requireRole("MANAGER", "ADMIN"), async (_req, res) => {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true }, // never the password hash
  });
  res.json(technicians);
});

// ===== GET /api/users - every user for the admin "Users" page (story #9) =====
// active users first, then by name
router.get("/", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: userFields,
  });
  res.json(users);
});

// body for adding a user. the admin sets a starting password and gives it to the person
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  role: z.enum(ROLES, { error: "Role must be CUSTOMER, TECHNICIAN, MANAGER or ADMIN" }),
});

// ===== POST /api/users - add a user (story #9) =====
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { name, email, password, role } = parsed.data;

  // 409 = conflicts with something that already exists
  if (await prisma.user.findUnique({ where: { email } })) {
    return res.status(409).json({ error: "A user with that email already exists" });
  }

  // same bcrypt hashing as the seed, we never store the real password
  const user = await prisma.user.create({
    data: { name, email, role, password: await bcrypt.hash(password, 10) },
    select: userFields,
  });
  res.status(201).json(user);
});

const roleSchema = z.object({
  role: z.enum(ROLES, { error: "Role must be CUSTOMER, TECHNICIAN, MANAGER or ADMIN" }),
});

// ===== PATCH /api/users/:id/role - change someone's role (story #9) =====
// an admin can't change their own role, so the system can never end up with no admin
router.patch("/:id/role", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const id = String(req.params.id);
  if (id === res.locals.userId) {
    return res.status(400).json({ error: "You can't change your own role" });
  }
  if (!(await prisma.user.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = await prisma.user.update({ where: { id }, data: { role: parsed.data.role }, select: userFields });
  res.json(user);
});

const activeSchema = z.object({
  active: z.boolean({ error: "active must be true or false" }),
});

// ===== PATCH /api/users/:id/active - deactivate or reactivate (story #9) =====
// an admin can't deactivate themselves (same reason - there's always at least one admin who can log in)
router.patch("/:id/active", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = activeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const id = String(req.params.id);
  if (id === res.locals.userId) {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }
  if (!(await prisma.user.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: "User not found" });
  }

  const user = await prisma.user.update({ where: { id }, data: { active: parsed.data.active }, select: userFields });
  res.json(user);
});

export default router;

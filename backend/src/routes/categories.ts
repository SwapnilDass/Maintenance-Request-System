// category routes - everything here is under /api/categories (see app.ts)
//
//   GET    /api/categories       every logged in user: the list for the submit form's dropdown
//   POST   /api/categories       admin: add a category (story #10)
//   PATCH  /api/categories/:id   admin: rename a category (story #10)
//   DELETE /api/categories/:id   admin: delete a category nobody has used yet (story #10)
//
// a category that requests already use can't be deleted, only renamed, so old requests keep a valid category
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// ===== GET /api/categories - the dropdown list (story #2), with how many requests use each (for the admin page) =====
router.get("/", requireAuth, async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { requests: true } } },
  });
  res.json(categories.map(({ _count, ...c }) => ({ ...c, requestCount: _count.requests })));
});

const nameSchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(50),
});

// names are unique ignoring case, so "plumbing" can't be added next to "Plumbing"
function findByName(name: string) {
  return prisma.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
}

// ===== POST /api/categories - add a category (story #10) =====
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (await findByName(parsed.data.name)) {
    return res.status(409).json({ error: "That category already exists" });
  }

  const category = await prisma.category.create({ data: { name: parsed.data.name } });
  res.status(201).json({ ...category, requestCount: 0 });
});

// ===== PATCH /api/categories/:id - rename (story #10) =====
// requests point at the category's id, so renaming updates every request that uses it
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await prisma.category.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: "Category not found" });
  }
  const existing = await findByName(parsed.data.name);
  if (existing && existing.id !== id) {
    return res.status(409).json({ error: "That category already exists" });
  }

  const category = await prisma.category.update({
    where: { id },
    data: { name: parsed.data.name },
    include: { _count: { select: { requests: true } } },
  });
  const { _count, ...rest } = category;
  res.json({ ...rest, requestCount: _count.requests });
});

// ===== DELETE /api/categories/:id - delete an unused category (story #10) =====
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await prisma.category.findUnique({ where: { id } }))) {
    return res.status(404).json({ error: "Category not found" });
  }

  const inUse = await prisma.request.count({ where: { categoryId: id } });
  if (inUse > 0) {
    return res.status(409).json({
      error: `This category is used by ${inUse} request${inUse === 1 ? "" : "s"}. Rename it instead.`,
    });
  }

  await prisma.category.delete({ where: { id } });
  res.status(204).end(); // 204 = done, nothing to send back
});

export default router;

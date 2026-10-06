import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// exported so the tests can check the validation rules directly
export const createRequestSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  description: z.string().trim().min(1, "Description is required").max(1000),
  location: z.string().trim().min(1, "Location is required").max(100),
  categoryId: z.number().int().positive("Category is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    error: "Priority must be LOW, MEDIUM, HIGH or URGENT",
  }),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    // send back the first problem so the form can show it
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { title, description, location, categoryId, priority } = parsed.data;

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    return res.status(400).json({ error: "Category does not exist" });
  }

  // userId comes from the token, not the body, so nobody can submit as someone else.
  // status isn't set here, the db default makes it "Submitted"
  const request = await prisma.request.create({
    data: {
      title,
      description,
      location,
      priority,
      categoryId,
      userId: res.locals.userId,
    },
    include: { category: true },
  });

  res.status(201).json(request);
});

export default router;

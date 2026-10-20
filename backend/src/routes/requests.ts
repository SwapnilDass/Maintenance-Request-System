// all the maintenance request API routes - everything here is under /api/requests (see app.ts)
//
//   sprint 1
//   POST  /api/requests              customer submits a new request (story #2)
//   GET   /api/requests/mine         customer sees their own requests + status (story #3)
//
//   sprint 2
//   GET   /api/requests/open         manager sees every open request (story #4)
//   GET   /api/requests/assigned     technician sees the requests assigned to them (story #6)
//   GET   /api/requests/:id          one request with its notes (detail page)
//   PATCH /api/requests/:id/assign   manager assigns it to a technician (story #5)
//   PATCH /api/requests/:id/status   technician moves it Assigned -> In Progress -> Resolved (story #7)
//   POST  /api/requests/:id/notes    technician/manager adds a progress note (story #7)
//
// every route starts with requireAuth (must be logged in) and most with requireRole (must be the right role)
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { isOpen, canMoveTo, CLOSED_STATUSES, STATUS } from "../lib/status";

const router = Router();

// what we send back about a person on a request - never the password hash
export const personFields = { select: { id: true, name: true, email: true } } as const;

// the rules for a new request - zod checks the body and rejects anything missing or invalid with a 400.
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

// ===== POST /api/requests - submit a new request (story #2) =====
// only customers/employees submit requests (story #1 - users only get the features meant for their role)
router.post("/", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
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

// ===== GET /api/requests/mine - my requests (story #3) =====
// story #3 - the logged in user's own requests, newest first, so they can check the status.
// userId comes from the token, so there's no way to ask for someone else's requests
router.get("/mine", requireAuth, requireRole("CUSTOMER"), async (_req, res) => {
  const requests = await prisma.request.findMany({
    where: { userId: res.locals.userId },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });

  res.json(requests);
});

// ---- sprint 2 ----
// note: these fixed paths (/open, /assigned) have to stay above "/:id" or express would treat
// the word "open" as a request id

// ===== GET /api/requests/open - all open requests for the manager (story #4) =====
// story #4 - every request that isn't resolved yet, from every user, for the manager's "All Requests" page.
// most urgent first, then oldest first within the same priority so nothing gets stuck at the bottom.
// (priority is a postgres enum LOW < MEDIUM < HIGH < URGENT, so "desc" puts URGENT on top)
router.get("/open", requireAuth, requireRole("MANAGER", "ADMIN"), async (_req, res) => {
  const requests = await prisma.request.findMany({
    where: { status: { notIn: CLOSED_STATUSES } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: {
      category: true,
      user: personFields, // who submitted it
      assignedTechnician: personFields, // null until a manager assigns it (story #5)
    },
  });

  res.json(requests);
});

// ===== GET /api/requests/assigned - my assigned requests for the technician (story #6) =====
// story #6 - the requests a manager assigned to me, for the technician's "My Assigned Requests" page.
// technicianId comes from the token, so a technician can't look at someone else's list.
// unfinished work comes first (most urgent, then oldest), resolved ones go to the bottom as history
router.get("/assigned", requireAuth, requireRole("TECHNICIAN"), async (_req, res) => {
  const requests = await prisma.request.findMany({
    where: { assignedTechnicianId: res.locals.userId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { category: true, user: personFields },
  });

  // sort is stable, so this keeps the priority/age order inside each group
  requests.sort((a, b) => Number(!isOpen(a.status)) - Number(!isOpen(b.status)));

  res.json(requests);
});

// ===== GET /api/requests/:id - one request + its notes (detail page) =====
// one request with its notes, for the request detail page (needed by story #7 - "everyone sees progress").
// who can see it: the person who submitted it, the technician it's assigned to, and managers/admins
router.get("/:id", requireAuth, async (req, res) => {
  const request = await prisma.request.findUnique({
    where: { id: String(req.params.id) },
    include: {
      category: true,
      user: personFields,
      assignedTechnician: personFields,
      notes: {
        orderBy: { createdAt: "asc" }, // read top to bottom like a conversation
        include: { author: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }

  const { userId, role } = res.locals;
  const allowed =
    request.userId === userId ||
    request.assignedTechnicianId === userId ||
    role === "MANAGER" ||
    role === "ADMIN";
  if (!allowed) {
    return res.status(403).json({ error: "You don't have permission to do that" });
  }

  res.json(request);
});

// what the #5/#7 endpoints send back after a change - same shape as /open so the pages can swap it in
const requestDetails = {
  category: true,
  user: personFields,
  assignedTechnician: personFields,
} as const;

// body must be { technicianId }
const assignSchema = z.object({
  technicianId: z.string().min(1, "Choose a technician"),
});

// ===== PATCH /api/requests/:id/assign - assign to a technician (story #5) =====
// story #5 - a manager assigns a request to a technician (or moves it to a different one).
// either way the status goes to "Assigned", so a reassigned request starts fresh with the new technician
router.patch("/:id/assign", requireAuth, requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const request = await prisma.request.findUnique({ where: { id: String(req.params.id) } });
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (!isOpen(request.status)) {
    return res.status(400).json({ error: "This request is already resolved" });
  }

  // the dropdown only lists technicians, but check anyway so nobody can assign work to a customer
  const technician = await prisma.user.findUnique({ where: { id: parsed.data.technicianId } });
  if (!technician || technician.role !== "TECHNICIAN") {
    return res.status(400).json({ error: "You can only assign requests to a technician" });
  }

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: { assignedTechnicianId: technician.id, status: STATUS.ASSIGNED },
    include: requestDetails,
  });

  res.json(updated);
});

// body must be { status }, ex. { "status": "In Progress" }
const statusSchema = z.object({
  status: z.string().min(1, "Status is required"),
});

// ===== PATCH /api/requests/:id/status - update status (story #7) =====
// story #7 - the assigned technician moves a request one step forward:
// Assigned -> In Progress -> Resolved (canMoveTo in lib/status.ts has the rules)
router.patch("/:id/status", requireAuth, requireRole("TECHNICIAN"), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const request = await prisma.request.findUnique({ where: { id: String(req.params.id) } });
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  // only the technician it's assigned to, not just any technician
  if (request.assignedTechnicianId !== res.locals.userId) {
    return res.status(403).json({ error: "This request isn't assigned to you" });
  }
  if (!canMoveTo(request.status, parsed.data.status)) {
    return res
      .status(400)
      .json({ error: `Can't change status from "${request.status}" to "${parsed.data.status}"` });
  }

  const updated = await prisma.request.update({
    where: { id: request.id },
    data: { status: parsed.data.status },
    include: requestDetails,
  });

  res.json(updated);
});

// body must be { body: "note text" }, trimmed, 1-1000 characters
const noteSchema = z.object({
  body: z.string().trim().min(1, "Note can't be empty").max(1000),
});

// ===== POST /api/requests/:id/notes - add a note (story #7) =====
// story #7 - add a progress note ("ordered a new part, back Thursday").
// the assigned technician and managers/admins can write them, the submitter reads them on the detail page
router.post("/:id/notes", requireAuth, requireRole("TECHNICIAN", "MANAGER", "ADMIN"), async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const request = await prisma.request.findUnique({ where: { id: String(req.params.id) } });
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (res.locals.role === "TECHNICIAN" && request.assignedTechnicianId !== res.locals.userId) {
    return res.status(403).json({ error: "This request isn't assigned to you" });
  }

  // authorId comes from the token so nobody can post a note as someone else
  const note = await prisma.note.create({
    data: { body: parsed.data.body, requestId: request.id, authorId: res.locals.userId },
    include: { author: { select: { id: true, name: true, role: true } } },
  });

  res.status(201).json(note);
});

export default router;

import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// list of technicians for the "assign to" dropdown on the manager page (story #5)
router.get("/technicians", requireAuth, requireRole("MANAGER", "ADMIN"), async (_req, res) => {
  const technicians = await prisma.user.findMany({
    where: { role: "TECHNICIAN" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true }, // never the password hash
  });
  res.json(technicians);
});

export default router;

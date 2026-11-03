// the numbers behind the manager dashboard (story #11) - under /api/metrics (see app.ts)
//
//   GET /api/metrics   manager/admin: request counts, completion rate, average time to resolve,
//                      open requests by priority and each technician's workload
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { STATUS, CLOSED_STATUSES } from "../lib/status";

const router = Router();

const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

router.get("/", requireAuth, requireRole("MANAGER", "ADMIN"), async (_req, res) => {
  // a few small counting queries instead of loading every request
  const [byStatusRows, openByPriorityRows, resolved, technicians, workloadRows] = await Promise.all([
    prisma.request.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.request.groupBy({
      by: ["priority"],
      where: { status: { notIn: CLOSED_STATUSES } },
      _count: { _all: true },
    }),
    prisma.request.findMany({
      where: { status: STATUS.RESOLVED, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    }),
    prisma.user.findMany({
      where: { role: "TECHNICIAN", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.request.groupBy({
      by: ["assignedTechnicianId", "status"],
      where: { assignedTechnicianId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // ---- totals ----
  const countFor = (status: string) => byStatusRows.find((r) => r.status === status)?._count._all ?? 0;
  const total = byStatusRows.reduce((sum, r) => sum + r._count._all, 0);
  const resolvedCount = countFor(STATUS.RESOLVED);

  // ---- average time to resolve, in hours (only requests resolved since sprint 3 have a resolvedAt) ----
  const avgResolveHours =
    resolved.length === 0
      ? null
      : resolved.reduce((sum, r) => sum + (r.resolvedAt!.getTime() - r.createdAt.getTime()), 0) /
        resolved.length /
        3_600_000;

  // ---- each active technician's workload ----
  const workload = technicians
    .map((t) => {
      const rows = workloadRows.filter((r) => r.assignedTechnicianId === t.id);
      const count = (status: string) => rows.find((r) => r.status === status)?._count._all ?? 0;
      const assigned = count(STATUS.ASSIGNED);
      const inProgress = count(STATUS.IN_PROGRESS);
      return { id: t.id, name: t.name, assigned, inProgress, open: assigned + inProgress, resolved: count(STATUS.RESOLVED) };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)); // busiest first

  res.json({
    total,
    open: total - resolvedCount,
    resolved: resolvedCount,
    // % of all requests that are resolved, rounded to 1 decimal
    completionRate: total === 0 ? 0 : Math.round((resolvedCount / total) * 1000) / 10,
    avgResolveHours: avgResolveHours === null ? null : Math.round(avgResolveHours * 10) / 10,
    byStatus: Object.values(STATUS).map((status) => ({ status, count: countFor(status) })),
    openByPriority: PRIORITIES.map((priority) => ({
      priority,
      count: openByPriorityRows.find((r) => r.priority === priority)?._count._all ?? 0,
    })),
    workload,
  });
});

export default router;

// notification routes (story #8) - everything here is under /api/notifications (see app.ts)
//
//   GET   /api/notifications            my latest notifications + how many are unread (the bell)
//   PATCH /api/notifications/:id/read   mark one as read
//   PATCH /api/notifications/read-all   mark all of mine as read
//
// every logged in role gets notifications; you only ever see and change your own.
// they're created by the request routes (see lib/notify.ts)
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// ===== GET /api/notifications - the bell's list =====
router.get("/", requireAuth, async (_req, res) => {
  const userId = res.locals.userId;
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20, // the latest 20 is plenty for a dropdown
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  res.json({ unreadCount, notifications });
});

// ===== PATCH /api/notifications/read-all =====
// above "/:id/read" isn't needed (different shape), but kept first so it reads top to bottom
router.patch("/read-all", requireAuth, async (_req, res) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId: res.locals.userId, read: false },
    data: { read: true },
  });
  res.json({ updated: count });
});

// ===== PATCH /api/notifications/:id/read =====
router.patch("/:id/read", requireAuth, async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: String(req.params.id) } });
  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }
  if (notification.userId !== res.locals.userId) {
    return res.status(403).json({ error: "That isn't your notification" });
  }

  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { read: true } });
  res.json(updated);
});

export default router;

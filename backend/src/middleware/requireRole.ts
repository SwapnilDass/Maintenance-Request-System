// put this after requireAuth on routes that only certain roles should use (story #1)
// ex. router.post("/", requireAuth, requireRole("CUSTOMER"), ...)
import type { Request, Response, NextFunction } from "express";

export type Role = "CUSTOMER" | "TECHNICIAN" | "MANAGER" | "ADMIN";

export function requireRole(...allowed: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    // requireAuth already put the role from the token in res.locals
    if (!allowed.includes(res.locals.role)) {
      // 403 = we know who you are, you just aren't allowed to do this (401 = not logged in)
      return res.status(403).json({ error: "You don't have permission to do that" });
    }
    next();
  };
}

// put this in front of any route that needs a logged in user
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // the frontend sends "Authorization: Bearer <token>" (see frontend/src/api/client.ts)
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "You must be logged in" });
  }

  const token = header.slice("Bearer ".length);
  try {
    // same secret we signed with in routes/auth.ts, throws if fake or expired
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      role: string;
    };
    // res.locals is express's place to pass data along to the route handler
    res.locals.userId = payload.userId;
    res.locals.role = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

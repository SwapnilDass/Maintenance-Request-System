import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // same error for unknown email and wrong password, so we don't tell
    // people which emails are actually registered
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // compares against the bcrypt hash, we never store the real password
  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // an admin deactivated this account (story #9). checked after the password so this message
  // only shows to someone who actually knows the password
  if (!user.active) {
    return res.status(403).json({ error: "This account has been deactivated. Contact an admin." });
  }

  // this token is what the frontend sends back on every request after
  // login, instead of the password, to prove who's asking
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// who am I? the frontend calls this on page load to check the saved token is still good
router.get("/me", requireAuth, async (_req, res) => {
  const user = await prisma.user.findUnique({ where: { id: res.locals.userId } });
  if (!user) {
    return res.status(401).json({ error: "User no longer exists" });
  }
  // deactivated since they logged in -> treat the saved login as expired, the frontend logs them out
  if (!user.active) {
    return res.status(401).json({ error: "This account has been deactivated" });
  }
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

export default router;

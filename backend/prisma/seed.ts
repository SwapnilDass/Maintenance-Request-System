
// one-off script to put test users in the db, run with "npm run prisma:seed"
import "dotenv/config"; // loads DATABASE_URL from .env
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // one demo user per role so we can show each role's view (story #1)
  const users = [
    { email: "customer@demo.com", name: "Casey Customer", role: "CUSTOMER" },
    { email: "tech@demo.com", name: "Terry Technician", role: "TECHNICIAN" },
    { email: "manager@demo.com", name: "Morgan Manager", role: "MANAGER" },
    { email: "admin@demo.com", name: "Alex Admin", role: "ADMIN" },
  ] as const;
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password: passwordHash },
    });
  }

  console.log(`Seeded users (password123): ${users.map((u) => u.email).join(", ")}`);

  // default categories for the submit request form dropdown
  // upsert so running the seed twice doesn't make duplicates
  const categories = ["Electrical", "Plumbing", "HVAC", "IT", "Other"];
  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log(`Seeded categories: ${categories.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

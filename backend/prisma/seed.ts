
// one-off script to put a test user in the db, run with "npm run prisma:seed"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: "customer@demo.com" },
    update: {},
    create: {
      email: "customer@demo.com",
      password: passwordHash,
      name: "Casey Customer",
      role: "CUSTOMER",
    },
  });

  console.log("Seeded customer@demo.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

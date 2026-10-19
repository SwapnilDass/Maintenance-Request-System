
// one-off script to put test users in the db, run with "npm run prisma:seed"
import "dotenv/config"; // loads DATABASE_URL from .env
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { STATUS } from "../src/lib/status";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // one demo user per role so we can show each role's view (story #1)
  const users = [
    { email: "customer@demo.com", name: "Casey Customer", role: "CUSTOMER" },
    { email: "tech@demo.com", name: "Terry Technician", role: "TECHNICIAN" },
    // a second technician so managers can choose who to assign to (sprint 2, story #5)
    { email: "tech2@demo.com", name: "Jordan Technician", role: "TECHNICIAN" },
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

  // sample requests so the manager and technician pages have something to show (sprint 2).
  // only added to an empty database, so running the seed again doesn't make duplicates
  if ((await prisma.request.count()) === 0) {
    const customer = await prisma.user.findUniqueOrThrow({ where: { email: "customer@demo.com" } });
    const tech = await prisma.user.findUniqueOrThrow({ where: { email: "tech@demo.com" } });
    const categoryId = async (name: string) =>
      (await prisma.category.findUniqueOrThrow({ where: { name } })).id;

    const samples = [
      // waiting for a manager to assign it (#4, #5)
      { title: "No heat in meeting room", description: "Room 112 radiator is cold all day.", location: "Building A, room 112", priority: "URGENT", category: "HVAC" },
      { title: "Flickering hallway lights", description: "Lights near the elevator flicker constantly.", location: "Building B, 2nd floor hallway", priority: "LOW", category: "Electrical" },
      // assigned to Terry, not started yet (#6)
      { title: "Printer jammed", description: "Shared printer shows a paper jam error.", location: "Building A, room 210", priority: "MEDIUM", category: "IT", assigned: true, status: STATUS.ASSIGNED },
      // Terry is working on it, with a progress note (#7)
      { title: "Leaking sink", description: "Water dripping under the kitchen sink.", location: "Building A, room 204", priority: "HIGH", category: "Plumbing", assigned: true, status: STATUS.IN_PROGRESS, note: "Ordered a replacement valve, should arrive Thursday." },
    ] as const;

    for (const s of samples) {
      const request = await prisma.request.create({
        data: {
          title: s.title,
          description: s.description,
          location: s.location,
          priority: s.priority,
          categoryId: await categoryId(s.category),
          userId: customer.id,
          ...("assigned" in s ? { assignedTechnicianId: tech.id, status: s.status } : {}),
        },
      });
      if ("note" in s) {
        await prisma.note.create({ data: { body: s.note, requestId: request.id, authorId: tech.id } });
      }
    }
    console.log(`Seeded ${samples.length} sample requests`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

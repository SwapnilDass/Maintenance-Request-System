// shared db connection - import this instead of making a new PrismaClient in every route file
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

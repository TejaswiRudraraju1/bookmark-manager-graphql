import { PrismaClient } from "@prisma/client";

// Single shared instance — Bun does not have hot-reload module caching issues
// the way Next.js does, so a simple module-level singleton is fine here.
const prisma = new PrismaClient();

export default prisma;

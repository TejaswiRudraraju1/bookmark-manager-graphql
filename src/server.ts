import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchema, createYoga } from "graphql-yoga";
import prisma from "./lib/prisma.ts";
import { folderResolvers } from "./resolvers/folderResolvers.ts";
import { bookmarkResolvers } from "./resolvers/bookmarkResolvers.ts";
import type { GraphQLContext } from "./types/context.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const typeDefs = readFileSync(
  join(__dirname, "schema", "schema.graphql"),
  "utf-8"
);

const yoga = createYoga<GraphQLContext>({
  schema: createSchema({
    typeDefs,
    resolvers: {
      Query: {
        ...folderResolvers.Query,
        ...bookmarkResolvers.Query,
      },
      Mutation: {
        ...bookmarkResolvers.Mutation,
      },
      Folder: folderResolvers.Folder,
    },
  }),
  context: () => ({ prisma }),
});

const port = Number(process.env["PORT"] ?? 4000);

// Use Bun's native serve() to avoid Node.js compatibility-mode overhead
Bun.serve({
  port,
  fetch: yoga,
});

console.log(`Bookmark Manager API ready at http://localhost:${port}/graphql`);

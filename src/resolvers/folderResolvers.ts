import type { GraphQLContext } from "../types/context.ts";
import type { GQLFolder } from "../types/resolvers.ts";

export const folderResolvers = {
  Query: {
    folders: async (
      _parent: unknown,
      _args: Record<string, never>,
      { prisma }: GraphQLContext
    ): Promise<GQLFolder[]> => {
      // Implemented in Milestone 4
      return prisma.folder.findMany();
    },

    folder: async (
      _parent: unknown,
      { id }: { id: string },
      { prisma }: GraphQLContext
    ): Promise<GQLFolder | null> => {
      // Implemented in Milestone 4
      return prisma.folder.findUnique({ where: { id } });
    },
  },
};

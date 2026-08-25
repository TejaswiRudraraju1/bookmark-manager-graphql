import type { GraphQLContext } from "../types/context.ts";
import type { GQLFolder, GQLBookmark } from "../types/resolvers.ts";

export const folderResolvers = {
  Query: {
    folders: async (
      _parent: unknown,
      _args: Record<string, never>,
      { prisma }: GraphQLContext
    ): Promise<GQLFolder[]> => {
      return prisma.folder.findMany({
        include: { bookmarks: true },
        orderBy: { createdAt: "asc" },
      });
    },

    folder: async (
      _parent: unknown,
      { id }: { id: string },
      { prisma }: GraphQLContext
    ): Promise<GQLFolder | null> => {
      return prisma.folder.findUnique({
        where: { id },
        include: { bookmarks: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      });
    },
  },

  // Field resolver — resolves Folder.bookmarks if not already eager-loaded.
  // Covers any future resolver path that returns a bare Folder without includes.
  Folder: {
    bookmarks: async (
      parent: GQLFolder,
      _args: Record<string, never>,
      { prisma }: GraphQLContext
    ): Promise<GQLBookmark[]> => {
      // Already loaded by the query resolvers above — return as-is.
      if (parent.bookmarks !== undefined) {
        return parent.bookmarks;
      }
      return prisma.bookmark.findMany({
        where: { folderId: parent.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    },
  },
};

import type { GraphQLContext } from "../types/context.ts";
import type {
  GQLBookmark,
  GQLBookmarkPage,
  GQLFolder,
  CreateFolderInput,
  CreateBookmarkInput,
  UpdateBookmarkInput,
} from "../types/resolvers.ts";
import {
  encodeCursor,
  decodeCursor,
  validateTake,
  buildCursorWhere,
} from "../lib/pagination.ts";

export const bookmarkResolvers = {
  Query: {
    bookmarks: async (
      _parent: unknown,
      args: {
        folderId?: string | null;
        search?: string | null;
        take?: number | null;
        cursor?: string | null;
      },
      { prisma }: GraphQLContext
    ): Promise<GQLBookmarkPage> => {
      const limit = validateTake(args.take);

      // Decode cursor if provided
      const cursorWhere =
        args.cursor != null ? buildCursorWhere(decodeCursor(args.cursor)) : {};

      // Build filter clauses
      const filterWhere = {
        ...(args.folderId != null && { folderId: args.folderId }),
        ...(args.search != null && {
          title: { contains: args.search, mode: "insensitive" as const },
        }),
      };

      // Fetch limit+1 to determine whether another page exists
      const rows = await prisma.bookmark.findMany({
        where: { AND: [filterWhere, cursorWhere] },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: limit + 1,
      });

      const hasNextPage = rows.length > limit;
      const items: GQLBookmark[] = hasNextPage ? rows.slice(0, limit) : rows;

      const lastItem = items[items.length - 1];
      const nextCursor =
        hasNextPage && lastItem != null
          ? encodeCursor(lastItem.createdAt, lastItem.id)
          : null;

      return { items, nextCursor };
    },
  },

  Mutation: {
    createFolder: async (
      _parent: unknown,
      { input }: { input: CreateFolderInput },
      { prisma }: GraphQLContext
    ): Promise<GQLFolder> => {
      // Implemented in Milestone 7
      return prisma.folder.create({ data: { name: input.name } });
    },

    createBookmark: async (
      _parent: unknown,
      { input }: { input: CreateBookmarkInput },
      { prisma }: GraphQLContext
    ): Promise<GQLBookmark> => {
      // Implemented in Milestone 7
      return prisma.bookmark.create({
        data: {
          title: input.title,
          url: input.url,
          tags: input.tags ?? [],
          folderId: input.folderId,
        },
      });
    },

    updateBookmark: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateBookmarkInput },
      { prisma }: GraphQLContext
    ): Promise<GQLBookmark> => {
      // Implemented in Milestone 7
      // Strip nulls — Prisma update data must not contain null for non-nullable fields
      const data: {
        title?: string;
        url?: string;
        tags?: string[];
      } = {};
      if (input.title != null) data.title = input.title;
      if (input.url != null) data.url = input.url;
      if (input.tags != null) data.tags = input.tags;

      return prisma.bookmark.update({ where: { id }, data });
    },

    deleteBookmark: async (
      _parent: unknown,
      { id }: { id: string },
      { prisma }: GraphQLContext
    ): Promise<boolean> => {
      // Implemented in Milestone 7
      await prisma.bookmark.delete({ where: { id } });
      return true;
    },

    moveBookmark: async (
      _parent: unknown,
      { id, folderId }: { id: string; folderId: string },
      { prisma }: GraphQLContext
    ): Promise<GQLBookmark> => {
      // Implemented in Milestone 7
      return prisma.bookmark.update({ where: { id }, data: { folderId } });
    },
  },
};

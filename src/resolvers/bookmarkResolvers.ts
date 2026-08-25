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
import { notFound } from "../lib/errors.ts";
import { validateTitle, validateUrl } from "../validation/bookmarkValidation.ts";

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

      const cursorWhere =
        args.cursor != null ? buildCursorWhere(decodeCursor(args.cursor)) : {};

      const filterWhere = {
        ...(args.folderId != null && { folderId: args.folderId }),
        ...(args.search != null && {
          title: { contains: args.search, mode: "insensitive" as const },
        }),
      };

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
      const name = validateTitle(input.name, "Folder name");
      return prisma.folder.create({ data: { name } });
    },

    createBookmark: async (
      _parent: unknown,
      { input }: { input: CreateBookmarkInput },
      { prisma }: GraphQLContext
    ): Promise<GQLBookmark> => {
      const title = validateTitle(input.title, "Bookmark title");
      validateUrl(input.url);

      // Verify the folder exists before attempting the insert
      const folder = await prisma.folder.findUnique({
        where: { id: input.folderId },
        select: { id: true },
      });
      if (folder === null) {
        throw notFound("Folder not found.");
      }

      return prisma.bookmark.create({
        data: {
          title,
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
      const existing = await prisma.bookmark.findUnique({
        where: { id },
        select: { id: true },
      });
      if (existing === null) {
        throw notFound("Bookmark not found.");
      }

      const data: { title?: string; url?: string; tags?: string[] } = {};

      if (input.title != null) {
        data.title = validateTitle(input.title, "Bookmark title");
      }
      if (input.url != null) {
        validateUrl(input.url);
        data.url = input.url;
      }
      if (input.tags != null) {
        data.tags = input.tags;
      }

      return prisma.bookmark.update({ where: { id }, data });
    },

    deleteBookmark: async (
      _parent: unknown,
      { id }: { id: string },
      { prisma }: GraphQLContext
    ): Promise<boolean> => {
      const existing = await prisma.bookmark.findUnique({
        where: { id },
        select: { id: true },
      });
      if (existing === null) {
        throw notFound("Bookmark not found.");
      }

      await prisma.bookmark.delete({ where: { id } });
      return true;
    },

    moveBookmark: async (
      _parent: unknown,
      { id, folderId }: { id: string; folderId: string },
      { prisma }: GraphQLContext
    ): Promise<GQLBookmark> => {
      const [bookmark, folder] = await Promise.all([
        prisma.bookmark.findUnique({ where: { id }, select: { id: true } }),
        prisma.folder.findUnique({ where: { id: folderId }, select: { id: true } }),
      ]);

      if (bookmark === null) {
        throw notFound("Bookmark not found.");
      }
      if (folder === null) {
        throw notFound("Folder not found.");
      }

      return prisma.bookmark.update({ where: { id }, data: { folderId } });
    },
  },
};

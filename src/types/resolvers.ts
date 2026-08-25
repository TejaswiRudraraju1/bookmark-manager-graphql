import type { GraphQLContext } from "./context.ts";
import type {
  Folder as PrismaFolder,
  Bookmark as PrismaBookmark,
} from "@prisma/client";

// ─── Scalar / primitive mappings ─────────────────────────────────────────────

type ID = string;

// ─── GraphQL object shapes returned by resolvers ─────────────────────────────

export type GQLFolder = PrismaFolder & { bookmarks?: PrismaBookmark[] };
export type GQLBookmark = PrismaBookmark;

export interface GQLBookmarkPage {
  items: GQLBookmark[];
  nextCursor: string | null;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateFolderInput {
  name: string;
}

export interface CreateBookmarkInput {
  title: string;
  url: string;
  tags?: string[] | null;
  folderId: string;
}

export interface UpdateBookmarkInput {
  title?: string | null;
  url?: string | null;
  tags?: string[] | null;
}

// ─── Resolver map ────────────────────────────────────────────────────────────

export interface Resolvers {
  Query: {
    folders: (
      parent: unknown,
      args: Record<string, never>,
      ctx: GraphQLContext
    ) => Promise<GQLFolder[]>;

    folder: (
      parent: unknown,
      args: { id: ID },
      ctx: GraphQLContext
    ) => Promise<GQLFolder | null>;

    bookmarks: (
      parent: unknown,
      args: {
        folderId?: string | null;
        search?: string | null;
        take?: number | null;
        cursor?: string | null;
      },
      ctx: GraphQLContext
    ) => Promise<GQLBookmarkPage>;
  };

  Mutation: {
    createFolder: (
      parent: unknown,
      args: { input: CreateFolderInput },
      ctx: GraphQLContext
    ) => Promise<GQLFolder>;

    createBookmark: (
      parent: unknown,
      args: { input: CreateBookmarkInput },
      ctx: GraphQLContext
    ) => Promise<GQLBookmark>;

    updateBookmark: (
      parent: unknown,
      args: { id: ID; input: UpdateBookmarkInput },
      ctx: GraphQLContext
    ) => Promise<GQLBookmark>;

    deleteBookmark: (
      parent: unknown,
      args: { id: ID },
      ctx: GraphQLContext
    ) => Promise<boolean>;

    moveBookmark: (
      parent: unknown,
      args: { id: ID; folderId: ID },
      ctx: GraphQLContext
    ) => Promise<GQLBookmark>;
  };
}

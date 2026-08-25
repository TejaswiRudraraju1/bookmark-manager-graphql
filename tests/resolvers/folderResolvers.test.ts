import { describe, it, expect, vi, beforeEach } from "vitest";
import { folderResolvers } from "../../src/resolvers/folderResolvers.ts";
import type { GraphQLContext } from "../../src/types/context.ts";
import type { Folder, Bookmark } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    name: "Dev",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "bm-1",
    title: "Bun Docs",
    url: "https://bun.sh",
    tags: [],
    folderId: "folder-1",
    createdAt: new Date("2024-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

/** Build a minimal mock context — only the Prisma methods under test are mocked. */
function makeCtx(overrides: {
  folderFindMany?: ReturnType<typeof vi.fn>;
  folderFindUnique?: ReturnType<typeof vi.fn>;
  bookmarkFindMany?: ReturnType<typeof vi.fn>;
}): GraphQLContext {
  return {
    prisma: {
      folder: {
        findMany: overrides.folderFindMany ?? vi.fn(),
        findUnique: overrides.folderFindUnique ?? vi.fn(),
      },
      bookmark: {
        findMany: overrides.bookmarkFindMany ?? vi.fn(),
      },
    },
  } as unknown as GraphQLContext;
}

// ─── folders ─────────────────────────────────────────────────────────────────

describe("folderResolvers.Query.folders", () => {
  it("returns all folders with their bookmarks", async () => {
    const folder1 = { ...makeFolder({ id: "f1", name: "Dev" }), bookmarks: [makeBookmark()] };
    const folder2 = { ...makeFolder({ id: "f2", name: "Design" }), bookmarks: [] };

    const findMany = vi.fn().mockResolvedValue([folder1, folder2]);
    const ctx = makeCtx({ folderFindMany: findMany });

    const result = await folderResolvers.Query.folders(undefined, {}, ctx);

    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Dev");
    expect(result[1]?.name).toBe("Design");
    expect(result[0]?.bookmarks).toHaveLength(1);
  });

  it("calls Prisma with include bookmarks and orderBy createdAt asc", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const ctx = makeCtx({ folderFindMany: findMany });

    await folderResolvers.Query.folders(undefined, {}, ctx);

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      include: { bookmarks: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("returns an empty array when there are no folders", async () => {
    const ctx = makeCtx({ folderFindMany: vi.fn().mockResolvedValue([]) });
    const result = await folderResolvers.Query.folders(undefined, {}, ctx);
    expect(result).toEqual([]);
  });
});

// ─── folder(id) ───────────────────────────────────────────────────────────────

describe("folderResolvers.Query.folder", () => {
  it("returns a folder with its nested bookmarks", async () => {
    const bm = makeBookmark();
    const folder = { ...makeFolder(), bookmarks: [bm] };

    const findUnique = vi.fn().mockResolvedValue(folder);
    const ctx = makeCtx({ folderFindUnique: findUnique });

    const result = await folderResolvers.Query.folder(undefined, { id: "folder-1" }, ctx);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("folder-1");
    expect(result?.bookmarks).toHaveLength(1);
    expect(result?.bookmarks?.[0]?.title).toBe("Bun Docs");
  });

  it("calls Prisma findUnique with the correct id and bookmark ordering", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const ctx = makeCtx({ folderFindUnique: findUnique });

    await folderResolvers.Query.folder(undefined, { id: "folder-1" }, ctx);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "folder-1" },
      include: { bookmarks: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
  });

  it("returns null when the folder does not exist", async () => {
    const ctx = makeCtx({ folderFindUnique: vi.fn().mockResolvedValue(null) });
    const result = await folderResolvers.Query.folder(undefined, { id: "nonexistent" }, ctx);
    expect(result).toBeNull();
  });
});

// ─── Folder.bookmarks field resolver ─────────────────────────────────────────

describe("folderResolvers.Folder.bookmarks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns pre-loaded bookmarks without hitting the database", async () => {
    const bm = makeBookmark();
    const parent = { ...makeFolder(), bookmarks: [bm] };

    const bookmarkFindMany = vi.fn();
    const ctx = makeCtx({ bookmarkFindMany });

    const result = await folderResolvers.Folder.bookmarks(parent, {}, ctx);

    expect(result).toEqual([bm]);
    expect(bookmarkFindMany).not.toHaveBeenCalled();
  });

  it("fetches bookmarks from the database when not pre-loaded", async () => {
    const bm = makeBookmark();
    const parent = makeFolder(); // no bookmarks property

    const bookmarkFindMany = vi.fn().mockResolvedValue([bm]);
    const ctx = makeCtx({ bookmarkFindMany });

    const result = await folderResolvers.Folder.bookmarks(parent, {}, ctx);

    expect(result).toEqual([bm]);
    expect(bookmarkFindMany).toHaveBeenCalledWith({
      where: { folderId: "folder-1" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
});

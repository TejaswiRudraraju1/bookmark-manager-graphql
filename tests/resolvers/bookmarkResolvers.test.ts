import { describe, it, expect, vi, beforeEach } from "vitest";
import { bookmarkResolvers } from "../../src/resolvers/bookmarkResolvers.ts";
import { encodeCursor } from "../../src/lib/pagination.ts";
import type { GraphQLContext } from "../../src/types/context.ts";
import type { Bookmark, Folder } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: "bm-1",
    title: "Bun Docs",
    url: "https://bun.sh",
    tags: [],
    folderId: "folder-1",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    name: "Dev",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

type MockPrisma = {
  folder: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  bookmark: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function makeMockPrisma(): MockPrisma {
  return {
    folder: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    bookmark: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function makeCtx(mock: MockPrisma): GraphQLContext {
  return { prisma: mock as unknown as GraphQLContext["prisma"] };
}

// ─── bookmarks query ──────────────────────────────────────────────────────────

describe("bookmarkResolvers.Query.bookmarks", () => {
  let mock: MockPrisma;
  let ctx: GraphQLContext;

  beforeEach(() => {
    mock = makeMockPrisma();
    ctx = makeCtx(mock);
  });

  it("returns all bookmarks when no filters are given", async () => {
    const bm1 = makeBookmark({ id: "bm-1" });
    const bm2 = makeBookmark({ id: "bm-2", title: "Prisma Docs" });
    mock.bookmark.findMany.mockResolvedValue([bm1, bm2]);

    const result = await bookmarkResolvers.Query.bookmarks(undefined, {}, ctx);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe("bm-1");
    expect(result.items[1]?.id).toBe("bm-2");
    expect(result.nextCursor).toBeNull();
  });

  it("passes folderId filter to Prisma when folderId is provided", async () => {
    mock.bookmark.findMany.mockResolvedValue([]);

    await bookmarkResolvers.Query.bookmarks(
      undefined,
      { folderId: "folder-1" },
      ctx
    );

    const callArgs = mock.bookmark.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    const filterWhere = callArgs.where.AND[0] as Record<string, unknown>;
    expect(filterWhere["folderId"]).toBe("folder-1");
  });

  it("passes case-insensitive title search to Prisma when search is provided", async () => {
    mock.bookmark.findMany.mockResolvedValue([]);

    await bookmarkResolvers.Query.bookmarks(
      undefined,
      { search: "bun" },
      ctx
    );

    const callArgs = mock.bookmark.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    const filterWhere = callArgs.where.AND[0] as Record<string, unknown>;
    expect(filterWhere["title"]).toEqual({ contains: "bun", mode: "insensitive" });
  });

  it("returns nextCursor when there are more results than take", async () => {
    // 3 rows returned for take:2 → indicates a next page
    const bm1 = makeBookmark({ id: "bm-1", createdAt: new Date("2024-01-01T00:00:00.000Z") });
    const bm2 = makeBookmark({ id: "bm-2", createdAt: new Date("2024-01-02T00:00:00.000Z") });
    const bm3 = makeBookmark({ id: "bm-3", createdAt: new Date("2024-01-03T00:00:00.000Z") });
    mock.bookmark.findMany.mockResolvedValue([bm1, bm2, bm3]);

    const result = await bookmarkResolvers.Query.bookmarks(
      undefined,
      { take: 2 },
      ctx
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe("bm-1");
    expect(result.items[1]?.id).toBe("bm-2");
    // bm3 signals there is a next page but should NOT be in items
    expect(result.items.find((i) => i.id === "bm-3")).toBeUndefined();
    expect(result.nextCursor).not.toBeNull();
  });

  it("returns nextCursor equal to the encoded last item when more pages exist", async () => {
    const last = makeBookmark({ id: "bm-2", createdAt: new Date("2024-01-02T00:00:00.000Z") });
    const extra = makeBookmark({ id: "bm-3", createdAt: new Date("2024-01-03T00:00:00.000Z") });
    mock.bookmark.findMany.mockResolvedValue([last, extra]);

    const result = await bookmarkResolvers.Query.bookmarks(
      undefined,
      { take: 1 },
      ctx
    );

    const expectedCursor = encodeCursor(last.createdAt, last.id);
    expect(result.nextCursor).toBe(expectedCursor);
  });

  it("returns nextCursor null when there are no further results", async () => {
    const bm1 = makeBookmark({ id: "bm-1" });
    const bm2 = makeBookmark({ id: "bm-2" });
    mock.bookmark.findMany.mockResolvedValue([bm1, bm2]);

    const result = await bookmarkResolvers.Query.bookmarks(
      undefined,
      { take: 5 },
      ctx
    );

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("passes cursor where-clause to Prisma when a valid cursor is provided", async () => {
    mock.bookmark.findMany.mockResolvedValue([]);

    const cursor = encodeCursor(new Date("2024-01-01T00:00:00.000Z"), "bm-0");

    await bookmarkResolvers.Query.bookmarks(
      undefined,
      { take: 2, cursor },
      ctx
    );

    const callArgs = mock.bookmark.findMany.mock.calls[0]?.[0] as {
      where: { AND: unknown[] };
    };
    // Second element of AND is the cursor where-clause
    const cursorWhere = callArgs.where.AND[1] as Record<string, unknown>;
    // Should contain an OR array for the two-branch cursor comparison
    expect(cursorWhere).toHaveProperty("OR");
    expect(Array.isArray(cursorWhere["OR"])).toBe(true);
  });

  it("rejects take:0 with BAD_USER_INPUT", async () => {
    await expect(
      bookmarkResolvers.Query.bookmarks(undefined, { take: 0 }, ctx)
    ).rejects.toMatchObject({
      message: "`take` must be a positive integer.",
      extensions: { code: "BAD_USER_INPUT" },
    });
  });

  it("rejects negative take with BAD_USER_INPUT", async () => {
    await expect(
      bookmarkResolvers.Query.bookmarks(undefined, { take: -1 }, ctx)
    ).rejects.toMatchObject({
      extensions: { code: "BAD_USER_INPUT" },
    });
  });

  it("rejects an invalid cursor with BAD_USER_INPUT", async () => {
    await expect(
      bookmarkResolvers.Query.bookmarks(
        undefined,
        { cursor: "this-is-not-a-cursor" },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Invalid pagination cursor.",
      extensions: { code: "BAD_USER_INPUT" },
    });
  });
});

// ─── createFolder ─────────────────────────────────────────────────────────────

describe("bookmarkResolvers.Mutation.createFolder", () => {
  let mock: MockPrisma;
  let ctx: GraphQLContext;

  beforeEach(() => {
    mock = makeMockPrisma();
    ctx = makeCtx(mock);
  });

  it("creates and returns a folder with trimmed name", async () => {
    const folder = makeFolder({ name: "Dev" });
    mock.folder.create.mockResolvedValue(folder);

    const result = await bookmarkResolvers.Mutation.createFolder(
      undefined,
      { input: { name: "  Dev  " } },
      ctx
    );

    expect(result.name).toBe("Dev");
    expect(mock.folder.create).toHaveBeenCalledWith({ data: { name: "Dev" } });
  });

  it("rejects an empty name with BAD_USER_INPUT and does not call Prisma", async () => {
    await expect(
      bookmarkResolvers.Mutation.createFolder(
        undefined,
        { input: { name: "" } },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Folder name cannot be empty.",
      extensions: { code: "BAD_USER_INPUT" },
    });

    expect(mock.folder.create).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only name with BAD_USER_INPUT and does not call Prisma", async () => {
    await expect(
      bookmarkResolvers.Mutation.createFolder(
        undefined,
        { input: { name: "   " } },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Folder name cannot be empty.",
      extensions: { code: "BAD_USER_INPUT" },
    });

    expect(mock.folder.create).not.toHaveBeenCalled();
  });
});

// ─── createBookmark ───────────────────────────────────────────────────────────

describe("bookmarkResolvers.Mutation.createBookmark", () => {
  let mock: MockPrisma;
  let ctx: GraphQLContext;

  beforeEach(() => {
    mock = makeMockPrisma();
    ctx = makeCtx(mock);
  });

  it("creates and returns a bookmark with trimmed title and default tags", async () => {
    const folder = makeFolder();
    const bm = makeBookmark({ title: "Bun Docs", tags: [] });
    mock.folder.findUnique.mockResolvedValue(folder);
    mock.bookmark.create.mockResolvedValue(bm);

    const result = await bookmarkResolvers.Mutation.createBookmark(
      undefined,
      {
        input: {
          title: "  Bun Docs  ",
          url: "https://bun.sh",
          folderId: "folder-1",
        },
      },
      ctx
    );

    expect(result.title).toBe("Bun Docs");
    expect(result.tags).toEqual([]);
    expect(mock.bookmark.create).toHaveBeenCalledWith({
      data: {
        title: "Bun Docs",
        url: "https://bun.sh",
        tags: [],
        folderId: "folder-1",
      },
    });
  });

  it("rejects an empty title with BAD_USER_INPUT and does not call Prisma create", async () => {
    await expect(
      bookmarkResolvers.Mutation.createBookmark(
        undefined,
        { input: { title: "", url: "https://example.com", folderId: "folder-1" } },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Bookmark title cannot be empty.",
      extensions: { code: "BAD_USER_INPUT" },
    });

    expect(mock.bookmark.create).not.toHaveBeenCalled();
  });

  it("rejects a malformed URL with BAD_USER_INPUT and does not call Prisma create", async () => {
    await expect(
      bookmarkResolvers.Mutation.createBookmark(
        undefined,
        { input: { title: "Test", url: "not-a-url", folderId: "folder-1" } },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Bookmark URL must be a valid absolute URL.",
      extensions: { code: "BAD_USER_INPUT" },
    });

    expect(mock.bookmark.create).not.toHaveBeenCalled();
  });

  it("rejects an unsupported protocol with BAD_USER_INPUT", async () => {
    await expect(
      bookmarkResolvers.Mutation.createBookmark(
        undefined,
        { input: { title: "Test", url: "ftp://example.com", folderId: "folder-1" } },
        ctx
      )
    ).rejects.toMatchObject({
      extensions: { code: "BAD_USER_INPUT" },
    });

    expect(mock.bookmark.create).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent folderId with NOT_FOUND and does not call Prisma create", async () => {
    mock.folder.findUnique.mockResolvedValue(null);

    await expect(
      bookmarkResolvers.Mutation.createBookmark(
        undefined,
        { input: { title: "Test", url: "https://example.com", folderId: "missing" } },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Folder not found.",
      extensions: { code: "NOT_FOUND" },
    });

    expect(mock.bookmark.create).not.toHaveBeenCalled();
  });
});

// ─── updateBookmark ───────────────────────────────────────────────────────────

describe("bookmarkResolvers.Mutation.updateBookmark", () => {
  let mock: MockPrisma;
  let ctx: GraphQLContext;

  beforeEach(() => {
    mock = makeMockPrisma();
    ctx = makeCtx(mock);
  });

  it("updates only the supplied fields and returns the updated bookmark", async () => {
    const existing = makeBookmark();
    const updated = makeBookmark({ title: "Updated" });
    mock.bookmark.findUnique.mockResolvedValue(existing);
    mock.bookmark.update.mockResolvedValue(updated);

    const result = await bookmarkResolvers.Mutation.updateBookmark(
      undefined,
      { id: "bm-1", input: { title: "Updated" } },
      ctx
    );

    expect(result.title).toBe("Updated");
    // Only title should be in the update data — url and tags omitted
    expect(mock.bookmark.update).toHaveBeenCalledWith({
      where: { id: "bm-1" },
      data: { title: "Updated" },
    });
  });

  it("updates tags when only tags are supplied", async () => {
    mock.bookmark.findUnique.mockResolvedValue(makeBookmark());
    mock.bookmark.update.mockResolvedValue(makeBookmark({ tags: ["a", "b"] }));

    await bookmarkResolvers.Mutation.updateBookmark(
      undefined,
      { id: "bm-1", input: { tags: ["a", "b"] } },
      ctx
    );

    expect(mock.bookmark.update).toHaveBeenCalledWith({
      where: { id: "bm-1" },
      data: { tags: ["a", "b"] },
    });
  });

  it("rejects a nonexistent bookmark with NOT_FOUND", async () => {
    mock.bookmark.findUnique.mockResolvedValue(null);

    await expect(
      bookmarkResolvers.Mutation.updateBookmark(
        undefined,
        { id: "missing", input: { title: "X" } },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Bookmark not found.",
      extensions: { code: "NOT_FOUND" },
    });

    expect(mock.bookmark.update).not.toHaveBeenCalled();
  });

  it("rejects an empty title update with BAD_USER_INPUT", async () => {
    mock.bookmark.findUnique.mockResolvedValue(makeBookmark());

    await expect(
      bookmarkResolvers.Mutation.updateBookmark(
        undefined,
        { id: "bm-1", input: { title: "" } },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Bookmark title cannot be empty.",
      extensions: { code: "BAD_USER_INPUT" },
    });
  });
});

// ─── deleteBookmark ───────────────────────────────────────────────────────────

describe("bookmarkResolvers.Mutation.deleteBookmark", () => {
  let mock: MockPrisma;
  let ctx: GraphQLContext;

  beforeEach(() => {
    mock = makeMockPrisma();
    ctx = makeCtx(mock);
  });

  it("deletes the bookmark and returns true", async () => {
    mock.bookmark.findUnique.mockResolvedValue(makeBookmark());
    mock.bookmark.delete.mockResolvedValue(makeBookmark());

    const result = await bookmarkResolvers.Mutation.deleteBookmark(
      undefined,
      { id: "bm-1" },
      ctx
    );

    expect(result).toBe(true);
    expect(mock.bookmark.delete).toHaveBeenCalledWith({ where: { id: "bm-1" } });
  });

  it("rejects a nonexistent bookmark with NOT_FOUND", async () => {
    mock.bookmark.findUnique.mockResolvedValue(null);

    await expect(
      bookmarkResolvers.Mutation.deleteBookmark(undefined, { id: "missing" }, ctx)
    ).rejects.toMatchObject({
      message: "Bookmark not found.",
      extensions: { code: "NOT_FOUND" },
    });

    expect(mock.bookmark.delete).not.toHaveBeenCalled();
  });
});

// ─── moveBookmark ─────────────────────────────────────────────────────────────

describe("bookmarkResolvers.Mutation.moveBookmark", () => {
  let mock: MockPrisma;
  let ctx: GraphQLContext;

  beforeEach(() => {
    mock = makeMockPrisma();
    ctx = makeCtx(mock);
  });

  it("moves the bookmark to the destination folder and returns it", async () => {
    const moved = makeBookmark({ folderId: "folder-2" });
    // findUnique is called twice in Promise.all — mock to return bookmark then folder
    mock.bookmark.findUnique.mockResolvedValue({ id: "bm-1" });
    mock.folder.findUnique.mockResolvedValue({ id: "folder-2" });
    mock.bookmark.update.mockResolvedValue(moved);

    const result = await bookmarkResolvers.Mutation.moveBookmark(
      undefined,
      { id: "bm-1", folderId: "folder-2" },
      ctx
    );

    expect(result.folderId).toBe("folder-2");
    expect(mock.bookmark.update).toHaveBeenCalledWith({
      where: { id: "bm-1" },
      data: { folderId: "folder-2" },
    });
  });

  it("rejects a nonexistent bookmark with NOT_FOUND", async () => {
    mock.bookmark.findUnique.mockResolvedValue(null);
    mock.folder.findUnique.mockResolvedValue({ id: "folder-2" });

    await expect(
      bookmarkResolvers.Mutation.moveBookmark(
        undefined,
        { id: "missing", folderId: "folder-2" },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Bookmark not found.",
      extensions: { code: "NOT_FOUND" },
    });

    expect(mock.bookmark.update).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent destination folder with NOT_FOUND", async () => {
    mock.bookmark.findUnique.mockResolvedValue({ id: "bm-1" });
    mock.folder.findUnique.mockResolvedValue(null);

    await expect(
      bookmarkResolvers.Mutation.moveBookmark(
        undefined,
        { id: "bm-1", folderId: "nonexistent" },
        ctx
      )
    ).rejects.toMatchObject({
      message: "Folder not found.",
      extensions: { code: "NOT_FOUND" },
    });

    expect(mock.bookmark.update).not.toHaveBeenCalled();
  });
});

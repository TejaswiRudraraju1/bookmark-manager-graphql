/**
 * Integration test — requires a real PostgreSQL instance.
 *
 * Uses the DATABASE_URL from .env (the Docker Compose PostgreSQL container).
 * Does NOT mock Prisma or the database.
 *
 * Isolation: every test tracks the IDs it creates and deletes them in afterEach,
 * so the test is safe to run against a database that already contains data.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

// Own PrismaClient instance — independent from the server singleton.
const prisma = new PrismaClient();

// Track created IDs so cleanup never touches pre-existing data.
const createdFolderIds: string[] = [];
const createdBookmarkIds: string[] = [];

beforeAll(async () => {
  // Verify the database is reachable before any test runs.
  // $queryRaw returns the DB version string; if the connection is broken this throws.
  await prisma.$queryRaw`SELECT 1`;
});

afterEach(async () => {
  // Delete in child-first order to respect the FK constraint.
  if (createdBookmarkIds.length > 0) {
    await prisma.bookmark.deleteMany({
      where: { id: { in: [...createdBookmarkIds] } },
    });
    createdBookmarkIds.length = 0;
  }
  if (createdFolderIds.length > 0) {
    await prisma.folder.deleteMany({
      where: { id: { in: [...createdFolderIds] } },
    });
    createdFolderIds.length = 0;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestFolder(name: string) {
  const folder = await prisma.folder.create({ data: { name } });
  createdFolderIds.push(folder.id);
  return folder;
}

async function createTestBookmark(
  folderId: string,
  overrides: { title?: string; url?: string; tags?: string[] } = {}
) {
  const bookmark = await prisma.bookmark.create({
    data: {
      title: overrides.title ?? "Test Bookmark",
      url: overrides.url ?? "https://example.com",
      tags: overrides.tags ?? [],
      folderId,
    },
  });
  createdBookmarkIds.push(bookmark.id);
  return bookmark;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PostgreSQL integration", () => {
  it("persists a folder and retrieves it by id", async () => {
    const created = await createTestFolder("Integration Test Folder");

    const fetched = await prisma.folder.findUnique({
      where: { id: created.id },
    });

    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.name).toBe("Integration Test Folder");
    expect(fetched?.createdAt).toBeInstanceOf(Date);
  });

  it("persists a bookmark and retrieves it with correct field values", async () => {
    const folder = await createTestFolder("Bookmark Test Folder");
    const created = await createTestBookmark(folder.id, {
      title: "Prisma Docs",
      url: "https://prisma.io",
      tags: ["orm", "database"],
    });

    const fetched = await prisma.bookmark.findUnique({
      where: { id: created.id },
    });

    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.title).toBe("Prisma Docs");
    expect(fetched?.url).toBe("https://prisma.io");
    expect(fetched?.tags).toEqual(["orm", "database"]);
    expect(fetched?.folderId).toBe(folder.id);
    expect(fetched?.createdAt).toBeInstanceOf(Date);
  });

  it("enforces the Folder → Bookmark relationship via folderId", async () => {
    const folder = await createTestFolder("Relationship Test Folder");
    const bm1 = await createTestBookmark(folder.id, { title: "Bookmark A" });
    const bm2 = await createTestBookmark(folder.id, { title: "Bookmark B" });

    // Read the folder including its bookmarks through Prisma's relation include
    const folderWithBookmarks = await prisma.folder.findUnique({
      where: { id: folder.id },
      include: { bookmarks: { orderBy: { title: "asc" } } },
    });

    expect(folderWithBookmarks).not.toBeNull();
    expect(folderWithBookmarks?.bookmarks).toHaveLength(2);

    const titles = folderWithBookmarks?.bookmarks.map((b) => b.title);
    expect(titles).toEqual(["Bookmark A", "Bookmark B"]);

    // Each bookmark's folderId must reference the parent folder
    for (const bm of folderWithBookmarks?.bookmarks ?? []) {
      expect(bm.folderId).toBe(folder.id);
    }

    // Sanity-check the created IDs match
    const ids = folderWithBookmarks?.bookmarks.map((b) => b.id);
    expect(ids).toContain(bm1.id);
    expect(ids).toContain(bm2.id);
  });

  it("cascades folder deletion to its bookmarks", async () => {
    const folder = await createTestFolder("Cascade Test Folder");
    const bm = await createTestBookmark(folder.id, { title: "Will be deleted" });

    // Delete the folder directly — the bookmark should cascade-delete
    await prisma.folder.delete({ where: { id: folder.id } });

    // Remove from tracking since we just deleted them manually
    createdFolderIds.splice(createdFolderIds.indexOf(folder.id), 1);
    createdBookmarkIds.splice(createdBookmarkIds.indexOf(bm.id), 1);

    const orphan = await prisma.bookmark.findUnique({ where: { id: bm.id } });
    expect(orphan).toBeNull();
  });

  it("returns bookmarks filtered by folderId via findMany", async () => {
    const folderA = await createTestFolder("Filter Folder A");
    const folderB = await createTestFolder("Filter Folder B");

    await createTestBookmark(folderA.id, { title: "In A" });
    await createTestBookmark(folderB.id, { title: "In B" });

    const results = await prisma.bookmark.findMany({
      where: { folderId: folderA.id },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("In A");
    expect(results[0]?.folderId).toBe(folderA.id);
  });

  it("returns bookmarks matching a case-insensitive title search", async () => {
    const folder = await createTestFolder("Search Test Folder");
    await createTestBookmark(folder.id, { title: "GraphQL Guide" });
    await createTestBookmark(folder.id, { title: "TypeScript Handbook" });

    const results = await prisma.bookmark.findMany({
      where: {
        folderId: folder.id,
        title: { contains: "GRAPHQL", mode: "insensitive" },
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("GraphQL Guide");
  });

  it("persists an empty tags array and a non-empty tags array correctly", async () => {
    const folder = await createTestFolder("Tags Test Folder");
    const noTags = await createTestBookmark(folder.id, { title: "No Tags", tags: [] });
    const withTags = await createTestBookmark(folder.id, {
      title: "With Tags",
      tags: ["ts", "graphql"],
    });

    const fetchedNoTags = await prisma.bookmark.findUnique({
      where: { id: noTags.id },
    });
    const fetchedWithTags = await prisma.bookmark.findUnique({
      where: { id: withTags.id },
    });

    expect(fetchedNoTags?.tags).toEqual([]);
    expect(fetchedWithTags?.tags).toEqual(["ts", "graphql"]);
  });
});

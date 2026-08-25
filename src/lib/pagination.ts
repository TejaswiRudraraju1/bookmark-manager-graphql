import { GraphQLError } from "graphql";

// ─── Constants ────────────────────────────────────────────────────────────────

export const PAGINATION_DEFAULT_TAKE = 20;
export const PAGINATION_MAX_TAKE = 100;

// ─── Cursor shape ─────────────────────────────────────────────────────────────

interface CursorPayload {
  createdAt: string; // ISO-8601
  id: string;
}

// ─── Encode ───────────────────────────────────────────────────────────────────

export function encodeCursor(createdAt: Date, id: string): string {
  const payload: CursorPayload = { createdAt: createdAt.toISOString(), id };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

// ─── Decode ───────────────────────────────────────────────────────────────────

export function decodeCursor(cursor: string): CursorPayload {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64").toString("utf-8");
  } catch {
    throw new GraphQLError("Invalid pagination cursor.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GraphQLError("Invalid pagination cursor.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)["createdAt"] !== "string" ||
    typeof (parsed as Record<string, unknown>)["id"] !== "string"
  ) {
    throw new GraphQLError("Invalid pagination cursor.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const record = parsed as Record<string, unknown>;
  const createdAt = record["createdAt"] as string;
  const id = record["id"] as string;

  if (isNaN(Date.parse(createdAt))) {
    throw new GraphQLError("Invalid pagination cursor.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return { createdAt, id };
}

// ─── Take validation ──────────────────────────────────────────────────────────

export function validateTake(take: number | null | undefined): number {
  if (take == null) return PAGINATION_DEFAULT_TAKE;

  if (!Number.isInteger(take) || take <= 0) {
    throw new GraphQLError(
      "`take` must be a positive integer.",
      { extensions: { code: "BAD_USER_INPUT" } }
    );
  }

  if (take > PAGINATION_MAX_TAKE) {
    throw new GraphQLError(
      `\`take\` must not exceed ${PAGINATION_MAX_TAKE}.`,
      { extensions: { code: "BAD_USER_INPUT" } }
    );
  }

  return take;
}

// ─── Cursor where-clause ──────────────────────────────────────────────────────
//
// We want records strictly AFTER (createdAt, id), i.e.:
//   createdAt > cursor.createdAt
//   OR (createdAt = cursor.createdAt AND id > cursor.id)
//
// Prisma does not support OR at the top level of a compound cursor directly,
// so we express it with Prisma's `OR` array.

export function buildCursorWhere(cursor: CursorPayload): {
  OR: [
    { createdAt: { gt: Date } },
    { createdAt: { equals: Date }; id: { gt: string } },
  ];
} {
  const cursorDate = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { gt: cursorDate } },
      { createdAt: { equals: cursorDate }, id: { gt: cursor.id } },
    ],
  };
}

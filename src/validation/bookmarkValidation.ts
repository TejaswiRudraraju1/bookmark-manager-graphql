import { badInput } from "../lib/errors.ts";

/**
 * Validates and trims a folder or bookmark name/title.
 * Throws a GraphQL BAD_USER_INPUT error if the value is empty or whitespace-only.
 */
export function validateTitle(
  value: string,
  fieldLabel: string
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw badInput(`${fieldLabel} cannot be empty.`);
  }
  return trimmed;
}

/**
 * Validates an absolute URL.
 * Requires http: or https: protocol.
 * Throws a GraphQL BAD_USER_INPUT error if the URL is malformed or uses an
 * unsupported protocol.
 */
export function validateUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw badInput("Bookmark URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw badInput(
      "Bookmark URL must use the http or https protocol."
    );
  }

  return value;
}

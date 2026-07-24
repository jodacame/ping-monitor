import { ulid } from 'ulid';

/**
 * Public identifiers.
 *
 * We expose ULIDs (26-char, lexicographically sortable, time-ordered) as the
 * external ids for user-facing entities. They avoid leaking sequential primary
 * keys while remaining index-friendly. Internal hot tables (e.g. check results)
 * still reference monitors by a compact numeric key inside the database.
 */

/** Generate a new ULID. */
export function newId(): string {
  return ulid();
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Validate a string is a well-formed ULID. */
export function isValidId(value: string): boolean {
  return ULID_RE.test(value);
}

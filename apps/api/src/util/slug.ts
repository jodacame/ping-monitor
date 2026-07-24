import { randomBytes } from 'node:crypto';

/** Turn arbitrary text into a URL-safe slug. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** A short, lowercase, URL-safe random suffix for disambiguating slugs. */
export function randomSlugSuffix(bytes = 4): string {
  return randomBytes(bytes).toString('hex');
}

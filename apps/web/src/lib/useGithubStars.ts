import { useEffect, useState } from 'react';
import { GITHUB_REPO_API_URL } from './constants';

const CACHE_KEY = 'pm.githubStars';
/**
 * GitHub allows only 60 anonymous API calls per hour and per IP, and a whole
 * office can share one IP. Six hours is fresh enough for a star count and
 * keeps a dashboard reload from spending the quota.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CachedStars {
  stars: number;
  fetchedAt: number;
}

function readCache(): CachedStars | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedStars>;
    if (typeof parsed.stars !== 'number' || typeof parsed.fetchedAt !== 'number') return null;
    return { stars: parsed.stars, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(stars: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ stars, fetchedAt: Date.now() }));
  } catch {
    /* ignore persistence errors (private mode, full storage) */
  }
}

/** Anonymous GET — no headers, no credentials, nothing about the instance leaves. */
async function fetchStars(signal: AbortSignal): Promise<number | null> {
  const res = await fetch(GITHUB_REPO_API_URL, { credentials: 'omit', signal });
  if (!res.ok) return null;
  const body = (await res.json()) as { stargazers_count?: unknown };
  return typeof body.stargazers_count === 'number' ? body.stargazers_count : null;
}

/**
 * Star count of the public repository, or `null` when it is unknown.
 *
 * This is a self-hosted product, so the call is best-effort only: an instance
 * may be offline, firewalled, or rate-limited. Any failure resolves to `null`
 * and the caller simply renders no count — never an error, never a zero, never
 * a console message, and never anything that blocks or delays the UI.
 */
export function useGithubStars(): number | null {
  const [stars, setStars] = useState<number | null>(() => readCache()?.stars ?? null);

  useEffect(() => {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;

    let active = true;
    const controller = new AbortController();
    fetchStars(controller.signal)
      .then((count) => {
        if (count === null) return;
        writeCache(count);
        if (active) setStars(count);
      })
      .catch(() => {
        /* Fail quietly: keep whatever was cached, show no count otherwise. */
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return stars;
}

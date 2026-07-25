/** Human-friendly formatting helpers, written for a non-technical audience. */

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatUptime(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return '—';
  const pct = ratio * 100;
  // Show more precision as it approaches 100% (99.95% reads better than 100%).
  const decimals = pct >= 99.95 ? 2 : pct >= 99 ? 2 : 1;
  return `${pct.toFixed(decimals)}%`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** A friendly label for a monitor's target (host without scheme when long). */
export function prettyTarget(target: string): string {
  try {
    const url = new URL(target);
    return url.host + (url.pathname !== '/' ? url.pathname : '');
  } catch {
    return target;
  }
}

/**
 * The target as a browsable link, or null when it is not one.
 *
 * Parsing alone is not enough: a TCP target such as "example.com:443" is a
 * valid URL whose protocol is "example.com:", so the scheme must be checked
 * explicitly. ICMP targets (bare hosts) simply fail to parse.
 */
export function linkableUrl(target: string): string | null {
  try {
    const url = new URL(target);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

import type { Logger } from '@ping/config';
import type { Database } from '@ping/db';
import { isValidIpOrCidr } from './util/ip.js';

/**
 * Checks that run once at boot to surface configuration that would otherwise
 * fail silently — in particular after an upgrade, where a stricter rule can
 * invalidate data an older version happily accepted.
 *
 * These only ever log. Nothing here blocks startup: an instance must keep
 * serving even when a warning applies.
 */

/**
 * Earlier versions parsed IP allowlists loosely: a malformed entry such as
 * `10.0.0.5/` was read as a /0 and matched every address. Matching is strict
 * now and fails closed, so a key carrying such an entry stops authenticating.
 * Name those keys so the operator can fix them instead of hunting a 401.
 */
export async function warnAboutInvalidIpAllowlists(
  db: Database,
  logger: Logger,
): Promise<void> {
  try {
    const res = await db.query<{ public_id: string; name: string; allowed_ips: string[] }>(
      `SELECT public_id, name, allowed_ips
         FROM api_keys
        WHERE revoked_at IS NULL
          AND allowed_ips IS NOT NULL`,
    );

    const broken = res.rows
      .map((row) => ({
        key: row.name,
        id: row.public_id,
        invalid: (row.allowed_ips ?? []).filter((entry) => !isValidIpOrCidr(entry)),
      }))
      .filter((row) => row.invalid.length > 0);

    if (broken.length === 0) return;

    logger.warn(
      { keys: broken },
      'API keys have IP allowlist entries that are not valid addresses or CIDR blocks. ' +
        'Older versions accepted these and some matched every address; matching is strict now, ' +
        'so these keys will reject every request. Recreate them with valid entries.',
    );
  } catch (err) {
    // A diagnostic must never keep the API from starting.
    logger.debug({ err }, 'could not check API key IP allowlists');
  }
}

/**
 * `TRUST_PROXY` must match the real number of proxies in front of the API.
 * Configure too few and every client collapses into one rate-limit bucket
 * (a shared 429 storm); too many and callers can forge their own IP.
 */
export function warnAboutTrustProxy(trustProxy: boolean | number | string[], logger: Logger): void {
  if (trustProxy === true) {
    logger.warn(
      'TRUST_PROXY=true trusts every X-Forwarded-For hop, so any caller can forge their client IP ' +
        'and bypass rate limiting and API-key IP allowlists. Set it to the number of proxies in ' +
        'front of this service instead.',
    );
    return;
  }
  if (trustProxy === false) {
    logger.info(
      'TRUST_PROXY is off: the client IP is the socket address. If a proxy fronts this service ' +
        '(nginx, Cloudflare Tunnel, a load balancer), set TRUST_PROXY to the number of proxies, ' +
        'or every client will share one rate-limit bucket.',
    );
  }
}

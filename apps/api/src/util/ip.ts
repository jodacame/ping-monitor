import ipaddr from 'ipaddr.js';

/**
 * IP allowlist matching for API keys.
 *
 * Hand-rolled parsing is how allowlists fail open, so both validation and
 * matching go through `ipaddr.js`, which covers IPv4, IPv6 and CIDR for both
 * families. Every helper here fails closed: anything unparseable is a non-match,
 * never a wildcard.
 */

/** Parse an address, unwrapping IPv4-mapped IPv6 (`::ffff:1.2.3.4`) to IPv4. */
function parseAddress(value: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  if (!ipaddr.isValid(value)) return null;
  const parsed = ipaddr.parse(value);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return v6.toIPv4Address();
  }
  return parsed;
}

/**
 * Whether an allowlist entry is a usable address or CIDR block. Used to reject
 * bad input at write time so a key is never stored with a rule that can only
 * ever fail (or, worse, match everything).
 */
export function isValidIpOrCidr(entry: string): boolean {
  const value = entry.trim();
  if (value === '') return false;
  if (!value.includes('/')) return ipaddr.isValid(value);
  // `isValidCIDR` rejects an empty, non-numeric or out-of-range prefix length,
  // which a manual `Number(bits)` parse would silently treat as /0 — a rule
  // matching every address.
  return ipaddr.isValidCIDR(value);
}

/** Whether `ip` satisfies a single allowlist entry (exact address or CIDR). */
export function ipMatchesEntry(ip: string, entry: string): boolean {
  const value = entry.trim();
  const address = parseAddress(ip);
  if (!address) return false;

  if (!value.includes('/')) {
    const candidate = parseAddress(value);
    // Compare parsed forms so equivalent notations match (e.g. `2001:db8::1`
    // and `2001:0db8:0:0:0:0:0:1`).
    return (
      candidate !== null &&
      candidate.kind() === address.kind() &&
      candidate.toNormalizedString() === address.toNormalizedString()
    );
  }

  if (!ipaddr.isValidCIDR(value)) return false;
  const [range, bits] = ipaddr.parseCIDR(value);
  // An IPv4 address never belongs to an IPv6 block, and vice versa.
  if (range.kind() !== address.kind()) return false;
  return address.match(range, bits);
}

/** Whether `ip` matches any entry in the allowlist. */
export function ipAllowed(ip: string, list: readonly string[]): boolean {
  return list.some((entry) => ipMatchesEntry(ip, entry));
}

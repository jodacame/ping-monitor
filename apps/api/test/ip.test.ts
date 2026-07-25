import { describe, expect, it } from 'vitest';
import { ipAllowed, ipMatchesEntry, isValidIpOrCidr } from '../src/util/ip.js';

describe('isValidIpOrCidr', () => {
  it('accepts IPv4, IPv6 and CIDR blocks of both families', () => {
    for (const entry of ['203.0.113.7', '10.0.0.0/8', '2001:db8::1', '2001:db8::/32']) {
      expect(isValidIpOrCidr(entry)).toBe(true);
    }
  });

  it('rejects a trailing slash, which must never be read as /0', () => {
    // Regression: a bare Number('') parse yields 0, i.e. a mask matching every
    // address, silently turning a pinned key into an unrestricted one.
    expect(isValidIpOrCidr('10.0.0.5/')).toBe(false);
  });

  it('rejects out-of-range prefixes and malformed addresses', () => {
    for (const entry of ['203.0.113.0/33', '10.0.0.0/-1', '10.0.0.0/abc', '10.0.0.', '999.1.1.1', '', '   ']) {
      expect(isValidIpOrCidr(entry)).toBe(false);
    }
  });
});

describe('ipMatchesEntry', () => {
  it('matches an exact IPv4 address', () => {
    expect(ipMatchesEntry('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(ipMatchesEntry('203.0.113.8', '203.0.113.7')).toBe(false);
  });

  it('matches inside an IPv4 CIDR block and not outside it', () => {
    expect(ipMatchesEntry('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(ipMatchesEntry('11.1.2.3', '10.0.0.0/8')).toBe(false);
  });

  it('treats an IPv4-mapped IPv6 client address as IPv4', () => {
    expect(ipMatchesEntry('::ffff:203.0.113.7', '203.0.113.7')).toBe(true);
    expect(ipMatchesEntry('::ffff:10.1.2.3', '10.0.0.0/8')).toBe(true);
  });

  it('supports IPv6 exact matches regardless of notation', () => {
    expect(ipMatchesEntry('2001:db8::1', '2001:0db8:0:0:0:0:0:1')).toBe(true);
  });

  it('supports IPv6 CIDR blocks', () => {
    expect(ipMatchesEntry('2001:db8::dead:beef', '2001:db8::/32')).toBe(true);
    expect(ipMatchesEntry('2001:dead::1', '2001:db8::/32')).toBe(false);
  });

  it('never matches across address families', () => {
    expect(ipMatchesEntry('203.0.113.7', '::/0')).toBe(false);
    expect(ipMatchesEntry('2001:db8::1', '0.0.0.0/0')).toBe(false);
  });

  it('fails closed on unparseable input', () => {
    expect(ipMatchesEntry('not-an-ip', '10.0.0.0/8')).toBe(false);
    expect(ipMatchesEntry('10.0.0.1', 'garbage')).toBe(false);
    expect(ipMatchesEntry('10.0.0.1', '10.0.0.5/')).toBe(false);
  });
});

describe('ipAllowed', () => {
  it('passes when any entry matches', () => {
    expect(ipAllowed('10.1.2.3', ['203.0.113.7', '10.0.0.0/8'])).toBe(true);
  });

  it('denies when no entry matches, including an empty list', () => {
    expect(ipAllowed('10.1.2.3', ['203.0.113.7'])).toBe(false);
    expect(ipAllowed('10.1.2.3', [])).toBe(false);
  });
});

import { createHash, randomBytes } from 'node:crypto';
import { NotFoundError, ValidationError, newId } from '@ping/core';
import { type ApiKeyAuth, type ApiKeyRecord, ApiKeyRepository, type Database } from '@ping/db';

const PREFIX = 'pk_';
const VALID_SCOPES = ['read', 'write'] as const;
export type Scope = (typeof VALID_SCOPES)[number];

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function isApiKey(token: string): boolean {
  return token.startsWith(PREFIX);
}

// --- IP allowlist matching (exact + IPv4 CIDR) -------------------------------

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipInt = ipToInt(ip);
  const rangeInt = range ? ipToInt(range) : null;
  if (ipInt === null || rangeInt === null || Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

function ipAllowed(ip: string, list: string[]): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return list.some((entry) =>
    entry.includes('/') ? ipInCidr(normalized, entry) : entry === normalized || entry === ip,
  );
}

export function apiKeyToDto(key: ApiKeyRecord): Record<string, unknown> {
  return {
    id: key.publicId,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    expiresAt: key.expiresAt,
    allowedIps: key.allowedIps,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  };
}

export interface CreateApiKeyOptions {
  readonly name: string;
  readonly scopes?: string[];
  readonly expiresInDays?: number;
  readonly allowedIps?: string[];
}

/** Developer API key lifecycle + verification with robust restrictions. */
export class ApiKeyService {
  constructor(private readonly db: Database) {}

  async create(
    workspaceId: string,
    options: CreateApiKeyOptions,
  ): Promise<{ record: ApiKeyRecord; key: string }> {
    const scopes = (options.scopes?.length ? options.scopes : ['read', 'write']).filter(
      (s): s is Scope => (VALID_SCOPES as readonly string[]).includes(s),
    );
    if (scopes.length === 0) throw new ValidationError('At least one scope is required');

    const key = `${PREFIX}${randomBytes(24).toString('base64url')}`;
    const record = await new ApiKeyRepository(this.db).create({
      publicId: newId(),
      workspaceId,
      name: options.name.trim(),
      prefix: `${key.slice(0, 11)}…`,
      keyHash: hashKey(key),
      scopes,
      expiresAt:
        options.expiresInDays && options.expiresInDays > 0
          ? new Date(Date.now() + options.expiresInDays * 86_400_000)
          : null,
      allowedIps: options.allowedIps?.length ? options.allowedIps : null,
    });
    return { record, key };
  }

  list(workspaceId: string): Promise<ApiKeyRecord[]> {
    return new ApiKeyRepository(this.db).list(workspaceId);
  }

  async revoke(workspaceId: string, publicId: string): Promise<void> {
    const revoked = await new ApiKeyRepository(this.db).revoke(publicId, workspaceId);
    if (!revoked) throw new NotFoundError('API key not found');
  }

  /**
   * Verify a presented key from a given client IP. Returns the authorized
   * workspace + scopes, or null if invalid/expired/IP-blocked.
   */
  async verify(key: string, ip: string): Promise<ApiKeyAuth | null> {
    if (!isApiKey(key)) return null;
    const repo = new ApiKeyRepository(this.db);
    const auth = await repo.findActiveByHash(hashKey(key));
    if (!auth) return null;
    if (auth.allowedIps && !ipAllowed(ip, auth.allowedIps)) return null;
    void repo.touch(auth.keyId).catch(() => undefined);
    return auth;
  }
}

import { createHash, randomBytes } from 'node:crypto';
import { NotFoundError, newId } from '@ping/core';
import { type ApiKeyAuth, type ApiKeyRecord, ApiKeyRepository, type Database } from '@ping/db';

const PREFIX = 'pk_';

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function isApiKey(token: string): boolean {
  return token.startsWith(PREFIX);
}

export function apiKeyToDto(key: ApiKeyRecord): Record<string, unknown> {
  return {
    id: key.publicId,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
  };
}

/** Developer API key lifecycle + verification. */
export class ApiKeyService {
  constructor(private readonly db: Database) {}

  /** Create a key; the full secret is returned once and never stored in clear. */
  async create(workspaceId: string, name: string): Promise<{ record: ApiKeyRecord; key: string }> {
    const key = `${PREFIX}${randomBytes(24).toString('base64url')}`;
    const record = await new ApiKeyRepository(this.db).create({
      publicId: newId(),
      workspaceId,
      name: name.trim(),
      prefix: `${key.slice(0, 11)}…`,
      keyHash: hashKey(key),
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

  /** Verify a presented key and return the workspace it authorizes (or null). */
  async verify(key: string): Promise<ApiKeyAuth | null> {
    if (!isApiKey(key)) return null;
    const repo = new ApiKeyRepository(this.db);
    const auth = await repo.findActiveByHash(hashKey(key));
    if (auth) void repo.touch(auth.keyId).catch(() => undefined);
    return auth;
  }
}

import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Token service.
 *
 * Access tokens are short-lived signed JWTs (stateless authorization). Refresh
 * tokens are opaque random strings; only their SHA-256 hash is persisted, and
 * they are rotated on every use so a leaked refresh token has a small blast
 * radius.
 */

export interface AccessTokenClaims {
  /** Public user id (ULID). */
  readonly sub: string;
  /** Internal user id (BIGINT as string). */
  readonly uid: string;
  readonly email: string;
}

export interface RefreshToken {
  readonly token: string;
  readonly hash: string;
  readonly expiresAt: Date;
}

export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly accessTtlSeconds: number,
    private readonly refreshTtlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  get accessTtl(): number {
    return this.accessTtlSeconds;
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ uid: claims.uid, email: claims.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.uid !== 'string' || typeof payload.email !== 'string') {
      throw new Error('Malformed access token');
    }
    return { sub: payload.sub, uid: payload.uid, email: payload.email };
  }

  issueRefreshToken(): RefreshToken {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      hash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
    };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

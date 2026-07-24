import { ConflictError, ForbiddenError, UnauthorizedError, newId } from '@ping/core';
import {
  type Database,
  RefreshTokenRepository,
  UserRepository,
  type UserRecord,
  WorkspaceRepository,
  WorkspaceRole,
} from '@ping/db';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { TokenService } from '../auth/tokens.js';
import { randomSlugSuffix, slugify } from '../util/slug.js';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
}

export interface AuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly user: PublicUser;
}

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: WorkspaceRole;
}

function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.publicId, email: user.email, name: user.name };
}

/**
 * Authentication and session lifecycle. Registration bootstraps a default
 * workspace so a new user has somewhere to create monitors immediately.
 */
export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly tokens: TokenService,
    /** Whether open self-service registration is enabled (env ALLOW_REGISTRATION). */
    private readonly allowRegistration: boolean,
  ) {}

  /**
   * Public registration state for the SPA:
   * - `needsSetup`  → clean install, no users yet: show first-account onboarding.
   * - `registrationOpen` → whether the register form should be offered at all
   *   (always true during setup; otherwise gated by ALLOW_REGISTRATION).
   */
  async registrationStatus(): Promise<{ needsSetup: boolean; registrationOpen: boolean }> {
    const needsSetup = !(await new UserRepository(this.db).hasAny());
    return { needsSetup, registrationOpen: needsSetup || this.allowRegistration };
  }

  async register(input: RegisterInput, userAgent: string | null): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const name = input.name?.trim() || null;

    const users = new UserRepository(this.db);
    // The first account is always allowed (clean-install onboarding); afterwards
    // registration is gated by ALLOW_REGISTRATION.
    if (!this.allowRegistration && (await users.hasAny())) {
      throw new ForbiddenError('Registration is disabled');
    }
    if (await users.existsByEmail(email)) {
      throw new ConflictError('Email already registered');
    }
    const passwordHash = await hashPassword(input.password);

    const user = await this.db.transaction(async (tx) => {
      const users = new UserRepository(tx);
      const workspaces = new WorkspaceRepository(tx);

      const created = await users.create({ publicId: newId(), email, passwordHash, name });
      const workspaceName = name ? `${name}'s Workspace` : 'My Workspace';
      const workspace = await workspaces.create({
        publicId: newId(),
        name: workspaceName,
        slug: `${slugify(workspaceName) || 'workspace'}-${randomSlugSuffix()}`,
      });
      await workspaces.addMember(workspace.id, created.id, WorkspaceRole.Owner);
      return created;
    });

    return this.issueSession(user, userAgent);
  }

  async login(input: LoginInput, userAgent: string | null): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const user = await new UserRepository(this.db).findByEmail(email);

    // Always run a verification to keep timing uniform whether or not the user
    // exists, mitigating account-enumeration via response time.
    const hash = user?.passwordHash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAA==';
    const ok = await verifyPassword(input.password, hash);
    if (!user || !ok) throw new UnauthorizedError('Invalid email or password');

    return this.issueSession(user, userAgent);
  }

  /** Rotate a refresh token: revoke the presented one, issue a fresh session. */
  async refresh(refreshToken: string, userAgent: string | null): Promise<AuthResult> {
    const tokenRepo = new RefreshTokenRepository(this.db);
    const active = await tokenRepo.findActiveByHash(this.tokens.hashRefreshToken(refreshToken));
    if (!active) throw new UnauthorizedError('Invalid or expired refresh token');

    await tokenRepo.revokeByHash(this.tokens.hashRefreshToken(refreshToken));

    const user = await new UserRepository(this.db).findById(active.userId);
    if (!user) throw new UnauthorizedError('Account no longer exists');

    return this.issueSession(user, userAgent);
  }

  async logout(refreshToken: string): Promise<void> {
    await new RefreshTokenRepository(this.db).revokeByHash(
      this.tokens.hashRefreshToken(refreshToken),
    );
  }

  /** Create a new workspace owned by the given user. */
  async createWorkspace(userId: string, name: string): Promise<WorkspaceSummary> {
    const trimmed = name.trim() || 'New Workspace';
    const workspace = await this.db.transaction(async (tx) => {
      const workspaces = new WorkspaceRepository(tx);
      const created = await workspaces.create({
        publicId: newId(),
        name: trimmed,
        slug: `${slugify(trimmed) || 'workspace'}-${randomSlugSuffix()}`,
      });
      await workspaces.addMember(created.id, userId, WorkspaceRole.Owner);
      return created;
    });
    return { id: workspace.publicId, name: workspace.name, slug: workspace.slug, role: WorkspaceRole.Owner };
  }

  async me(userId: string): Promise<{ user: PublicUser; workspaces: WorkspaceSummary[] }> {
    const user = await new UserRepository(this.db).findById(userId);
    if (!user) throw new UnauthorizedError('Account no longer exists');
    const memberships = await new WorkspaceRepository(this.db).listForUser(userId);
    return {
      user: toPublicUser(user),
      workspaces: memberships.map((w) => ({
        id: w.publicId,
        name: w.name,
        slug: w.slug,
        role: w.role,
      })),
    };
  }

  private async issueSession(user: UserRecord, userAgent: string | null): Promise<AuthResult> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.publicId,
      uid: user.id,
      email: user.email,
    });
    const refresh = this.tokens.issueRefreshToken();
    await new RefreshTokenRepository(this.db).create({
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
      userAgent,
    });

    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTtl,
      user: toPublicUser(user),
    };
  }
}

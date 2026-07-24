import type { WorkspaceRole } from '@ping/db';
import type { AppContext } from './context.js';

/** Authenticated principal attached to a request after the auth guard runs. */
export interface AuthUser {
  readonly userId: string;
  readonly publicId: string;
  readonly email: string;
}

/** Resolved workspace membership attached after the workspace guard runs. */
export interface WorkspaceContext {
  readonly id: string;
  readonly publicId: string;
  readonly role: WorkspaceRole;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
    workspace?: WorkspaceContext;
    apiKey?: {
      workspaceId: string;
      workspacePublicId: string;
      keyId: string;
      scopes: string[];
      allowedIps: string[] | null;
    };
  }
}

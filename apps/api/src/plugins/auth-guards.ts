import type { preHandlerHookHandler } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '@ping/core';
import { WorkspaceRepository } from '@ping/db';
import type { AppContext } from '../context.js';

/**
 * Request guards used as route `preHandler`s.
 *
 *  - `authenticate` verifies the bearer access token and attaches `authUser`.
 *  - `resolveWorkspace` ensures the caller is a member of `:workspaceId` and
 *    attaches the `workspace` context (id + role) for authorization.
 */
export interface AuthGuards {
  readonly authenticate: preHandlerHookHandler;
  readonly resolveWorkspace: preHandlerHookHandler;
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

export function createAuthGuards(ctx: AppContext): AuthGuards {
  const authenticate: preHandlerHookHandler = async (request) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedError('Missing bearer token');

    try {
      const claims = await ctx.tokens.verifyAccessToken(token);
      request.authUser = { userId: claims.uid, publicId: claims.sub, email: claims.email };
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  };

  const resolveWorkspace: preHandlerHookHandler = async (request) => {
    const user = request.authUser;
    if (!user) throw new UnauthorizedError();

    const params = request.params as { workspaceId?: string };
    const workspaceId = params.workspaceId;
    if (!workspaceId) throw new ForbiddenError('Workspace not specified');

    const membership = await new WorkspaceRepository(ctx.db).findForUser(workspaceId, user.userId);
    if (!membership) throw new ForbiddenError('You do not have access to this workspace');

    request.workspace = {
      id: membership.id,
      publicId: membership.publicId,
      role: membership.role,
    };
  };

  return { authenticate, resolveWorkspace };
}

import type { preHandlerAsyncHookHandler, preHandlerHookHandler } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '@ping/core';
import { WorkspaceRepository, WorkspaceRole } from '@ping/db';
import type { AppContext } from '../context.js';
import { isApiKey } from '../services/api-key-service.js';

/**
 * Request guards used as route `preHandler`s.
 *
 *  - `authenticate` accepts either a user JWT (sets `authUser`) or a developer
 *    API key (sets `apiKey`).
 *  - `resolveWorkspace` authorizes access to `:workspaceId` for either principal.
 *  - `requireUser` restricts a route to real user sessions (blocks API keys).
 */
export interface AuthGuards {
  readonly authenticate: preHandlerAsyncHookHandler;
  readonly resolveWorkspace: preHandlerAsyncHookHandler;
  readonly requireUser: preHandlerHookHandler;
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

export function createAuthGuards(ctx: AppContext): AuthGuards {
  const authenticate: preHandlerAsyncHookHandler = async (request) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedError('Missing bearer token');

    if (isApiKey(token)) {
      const auth = await ctx.apiKeys.verify(token, request.ip);
      if (!auth) throw new UnauthorizedError('Invalid, expired, or IP-blocked API key');
      request.apiKey = auth;
      // Read-only keys may only perform safe methods.
      const safe = request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS';
      if (!safe && !auth.scopes.includes('write')) {
        throw new ForbiddenError('This API key is read-only');
      }
      return;
    }

    try {
      const claims = await ctx.tokens.verifyAccessToken(token);
      request.authUser = { userId: claims.uid, publicId: claims.sub, email: claims.email };
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  };

  const resolveWorkspace: preHandlerAsyncHookHandler = async (request) => {
    const params = request.params as { workspaceId?: string };
    const workspaceId = params.workspaceId;
    if (!workspaceId) throw new ForbiddenError('Workspace not specified');

    if (request.apiKey) {
      if (request.apiKey.workspacePublicId !== workspaceId) {
        throw new ForbiddenError('This API key is not valid for this workspace');
      }
      // An API key acts as an admin of its workspace. That is safe only while
      // every membership is an Owner (workspaces are single-member today: there
      // is no route that adds a member, so `addMember` runs only at register /
      // create-workspace time). WHOEVER ADDS MEMBER MANAGEMENT must also gate
      // key creation by role and cap this to the creating member's role, or a
      // viewer will be able to mint an admin credential.
      request.workspace = {
        id: request.apiKey.workspaceId,
        publicId: workspaceId,
        role: WorkspaceRole.Admin,
      };
      return;
    }

    const user = request.authUser;
    if (!user) throw new UnauthorizedError();
    const membership = await new WorkspaceRepository(ctx.db).findForUser(workspaceId, user.userId);
    if (!membership) throw new ForbiddenError('You do not have access to this workspace');
    request.workspace = { id: membership.id, publicId: membership.publicId, role: membership.role };
  };

  const requireUser: preHandlerHookHandler = (request, _reply, done) => {
    if (!request.authUser) {
      done(new ForbiddenError('This action requires a signed-in user'));
      return;
    }
    done();
  };

  return { authenticate, resolveWorkspace, requireUser };
}

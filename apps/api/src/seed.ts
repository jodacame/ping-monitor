import { newId } from '@ping/core';
import {
  createLogger,
  loadCommonConfig,
  loadDatabaseConfig,
} from '@ping/config';
import {
  Database,
  MonitorRepository,
  UserRepository,
  WorkspaceRepository,
  WorkspaceRole,
} from '@ping/db';
import { hashPassword } from './auth/password.js';
import { GroupService } from './services/group-service.js';
import { type CreateMonitorInput, MonitorService } from './services/monitor-service.js';
import { TagService } from './services/tag-service.js';
import { randomSlugSuffix } from './util/slug.js';

/**
 * Seed a set of example monitors across every check type, with simple and
 * complex health checks, pointing at well-known public services. Idempotent:
 * examples whose name already exists are skipped. Run with:
 *   SEED_EMAIL=you@example.com SEED_PASSWORD=... pnpm --filter @ping/api run seed
 */

const EMAIL = process.env.SEED_EMAIL ?? 'demo@example.com';
const PASSWORD = process.env.SEED_PASSWORD ?? 'supersecret';

const defaults = {
  intervalSeconds: 60,
  timeoutMs: 10_000,
  failureThreshold: 3,
  recoveryThreshold: 1,
  quorum: 1,
  regionIds: [1],
  config: {} as Record<string, unknown>,
};
const ex = (partial: Partial<CreateMonitorInput> & Pick<CreateMonitorInput, 'name' | 'type' | 'target'>): CreateMonitorInput => ({
  ...defaults,
  ...partial,
});

async function ensureWorkspace(db: Database): Promise<string> {
  const users = new UserRepository(db);
  const existing = await users.findByEmail(EMAIL);
  if (existing) {
    const memberships = await new WorkspaceRepository(db).listForUser(existing.id);
    return memberships[0]!.id;
  }
  const passwordHash = await hashPassword(PASSWORD);
  return db.transaction(async (tx) => {
    const user = await new UserRepository(tx).create({
      publicId: newId(),
      email: EMAIL,
      passwordHash,
      name: 'Demo',
    });
    const ws = await new WorkspaceRepository(tx).create({
      publicId: newId(),
      name: "Demo's Workspace",
      slug: `demo-${randomSlugSuffix()}`,
    });
    await new WorkspaceRepository(tx).addMember(ws.id, user.id, WorkspaceRole.Owner);
    return ws.id;
  });
}

async function main(): Promise<void> {
  const common = loadCommonConfig();
  const logger = createLogger({ level: common.logLevel, pretty: true, base: { service: 'seed' } });
  const db = new Database(loadDatabaseConfig(), logger);

  try {
    const workspaceId = await ensureWorkspace(db);
    const monitors = new MonitorService(db);
    const groups = new GroupService(db);
    const tags = new TagService(db);

    // Tags (upsert by name) + a group.
    const web = await tags.create(workspaceId, 'Web', '#10b981');
    const apiTag = await tags.create(workspaceId, 'API', '#6366f1');
    const group = await groups.create(workspaceId, { name: 'Public services' });

    const examples: CreateMonitorInput[] = [
      // Simple HTTP: a 2xx response is healthy.
      ex({ name: 'Google', type: 'http', target: 'https://www.google.com', groupId: group.publicId, tagIds: [web.id] }),
      // Complex: JSON-path assertion on a real API.
      ex({
        name: 'GitHub API — JSON health',
        type: 'http',
        target: 'https://api.github.com',
        tagIds: [apiTag.id],
        config: {
          assertions: {
            logic: 'and',
            rules: [
              { source: 'status', op: 'eq', value: 200 },
              { source: 'json', path: 'current_user_url', op: 'contains', value: 'github' },
            ],
          },
        },
      }),
      // Keyword assertion in the body.
      ex({
        name: 'Wikipedia — keyword',
        type: 'http',
        target: 'https://en.wikipedia.org',
        intervalSeconds: 300,
        groupId: group.publicId,
        tagIds: [web.id],
        config: { keyword: 'Wikipedia' },
      }),
      // SSL certificate expiry guard.
      ex({
        name: 'Cloudflare — SSL expiry',
        type: 'http',
        target: 'https://www.cloudflare.com',
        intervalSeconds: 300,
        groupId: group.publicId,
        config: { sslExpiryThresholdDays: 30 },
      }),
      // Nested/complex JSON-path assertion.
      ex({
        name: 'httpbin — JSON path',
        type: 'http',
        target: 'https://httpbin.org/json',
        intervalSeconds: 300,
        tagIds: [apiTag.id],
        config: {
          assertions: {
            logic: 'and',
            rules: [{ source: 'json', path: 'slideshow.title', op: 'contains', value: 'Sample' }],
          },
        },
      }),
      // Intentionally down (HTTP 500) to demonstrate the failure path.
      ex({
        name: 'httpstat 500 — expected down',
        type: 'http',
        target: 'https://httpstat.us/500',
        intervalSeconds: 300,
        failureThreshold: 1,
      }),
      // TCP port reachability.
      ex({ name: 'Google DNS — TCP 443', type: 'tcp', target: 'dns.google', config: { port: 443 }, tagIds: [apiTag.id] }),
      // ICMP ping.
      ex({ name: 'Cloudflare DNS — Ping', type: 'icmp', target: '1.1.1.1' }),
    ];

    const existing = new Set(
      (await new MonitorRepository(db).list({ workspaceId, limit: 500, offset: 0 })).items.map(
        (m) => m.name,
      ),
    );

    let created = 0;
    for (const example of examples) {
      if (existing.has(example.name)) {
        logger.info({ name: example.name }, 'skip (already exists)');
        continue;
      }
      await monitors.create(workspaceId, example);
      created += 1;
      logger.info({ name: example.name, type: example.type }, 'created');
    }

    logger.info({ created, total: examples.length, email: EMAIL }, 'seed complete');
  } finally {
    await db.close();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort reporting before exit
  console.error(err);
  process.exit(1);
});

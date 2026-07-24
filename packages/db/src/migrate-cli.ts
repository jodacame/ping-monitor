import { createLogger, loadCommonConfig, loadDatabaseConfig } from '@ping/config';
import { Database } from './pool.js';
import { migrationStatus, runMigrations } from './migrator.js';

/**
 * Migration CLI. Usage:
 *   tsx src/migrate-cli.ts up       # apply pending migrations
 *   tsx src/migrate-cli.ts status   # list applied vs pending
 */
async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';
  const common = loadCommonConfig();
  const log = createLogger({
    level: common.logLevel,
    pretty: !common.isProduction,
    base: { service: 'migrate' },
  });
  const db = new Database(loadDatabaseConfig(), log);

  try {
    switch (command) {
      case 'up': {
        const applied = await runMigrations(db);
        if (applied.length === 0) log.info('Database is up to date; no pending migrations');
        else log.info({ applied }, `Applied ${applied.length} migration(s)`);
        break;
      }
      case 'status': {
        const status = await migrationStatus(db);
        for (const s of status) {
          log.info(`${s.applied ? '✓ applied ' : '· pending '} ${s.name}`);
        }
        break;
      }
      default:
        throw new Error(`Unknown command "${command}". Use "up" or "status".`);
    }
  } finally {
    await db.close();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort reporting before exit
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

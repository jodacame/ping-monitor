import { buildApp } from './app.js';
import { buildContext } from './context.js';
import { warnAboutInvalidIpAllowlists, warnAboutTrustProxy } from './startup-checks.js';

/** API entrypoint: build the context and server, listen, and shut down cleanly. */
async function main(): Promise<void> {
  const ctx = buildContext();
  const app = await buildApp(ctx);

  // Diagnostics for configuration and data that a stricter version can
  // invalidate. They only log, never block startup.
  warnAboutTrustProxy(ctx.apiConfig.trustProxy, ctx.logger);
  await warnAboutInvalidIpAllowlists(ctx.db, ctx.logger);

  await app.listen({ host: ctx.apiConfig.host, port: ctx.apiConfig.port });
  ctx.logger.info({ host: ctx.apiConfig.host, port: ctx.apiConfig.port }, 'API listening');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.logger.info({ signal }, 'shutting down API');
    await app.close();
    await ctx.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort reporting before exit
  console.error(err);
  process.exit(1);
});

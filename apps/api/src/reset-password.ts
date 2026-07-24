import { randomBytes } from 'node:crypto';
import { createLogger, loadCommonConfig, loadDatabaseConfig } from '@ping/config';
import { Database, RefreshTokenRepository, UserRepository } from '@ping/db';
import { hashPassword } from './auth/password.js';

/**
 * Admin CLI: reset a user's password without email/SMTP — the self-host escape
 * hatch when someone is locked out.
 *
 *   docker compose run --rm api pnpm --filter @ping/api run reset-password <email> [newPassword]
 *
 * If `newPassword` is omitted a strong random one is generated and printed.
 * Passwords must be at least 8 characters (same rule as sign-up). All of the
 * user's active sessions are revoked, forcing a fresh login.
 */

const MIN_PASSWORD = 8;

/** URL-safe random password; long enough to be safe when auto-generated. */
function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

async function main(): Promise<void> {
  const common = loadCommonConfig();
  const logger = createLogger({
    level: common.logLevel,
    pretty: !common.isProduction,
    base: { service: 'reset-password' },
  });

  const email = process.argv[2]?.trim().toLowerCase();
  const provided = process.argv[3];

  if (!email) {
    logger.error('Usage: reset-password <email> [newPassword]');
    process.exit(2);
  }

  const password = provided ?? generatePassword();
  if (password.length < MIN_PASSWORD) {
    logger.error(`Password must be at least ${MIN_PASSWORD} characters.`);
    process.exit(2);
  }

  const db = new Database(loadDatabaseConfig(), logger);
  try {
    const users = new UserRepository(db);
    const user = await users.findByEmail(email);
    if (!user) {
      logger.error({ email }, 'No user with that email.');
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await new UserRepository(tx).updatePassword(user.id, passwordHash);
      // Invalidate every existing session so a leaked/old token cannot be used.
      await new RefreshTokenRepository(tx).revokeAllForUser(user.id);
    });

    logger.info({ email }, 'Password reset. All active sessions were signed out.');
    if (!provided) {
      // Print the generated secret to stdout only (never logged structured).
      process.stdout.write(`\nNew password for ${email}:\n\n    ${password}\n\n`);
    }
  } finally {
    await db.close();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort reporting before exit
  console.error(err);
  process.exit(1);
});

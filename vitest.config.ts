import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Single Vitest configuration for the whole monorepo. `vite-tsconfig-paths`
 * makes the `@ping/*` workspace aliases resolve to package sources so unit and
 * integration tests run against TypeScript directly (no build step).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});

import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts: engines and rules are pure, so tests don't need workerd.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});

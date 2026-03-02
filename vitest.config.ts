import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types/**', 'src/tools/**', 'src/server.ts', '**/index.ts'],
      reporter: ['text-summary', 'text'],
    },
  },
});

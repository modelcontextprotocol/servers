import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/**/*.test.ts'],
    setupFiles: ['./__tests__/helpers/mocks.ts'],
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: ['**/__tests__/**', '**/dist/**'],
    },
  },
});

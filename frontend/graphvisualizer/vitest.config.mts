import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['lib/**', 'app/api/**'] },
  },
});

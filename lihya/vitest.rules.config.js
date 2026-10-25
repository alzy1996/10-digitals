import { defineConfig } from 'vitest/config';

// Firestore security rules tests. Run through `npm run test:rules`, which
// starts the Firestore emulator (firebase emulators:exec) first.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});

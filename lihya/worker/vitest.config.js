import { defineConfig } from 'vitest/config';

// Worker unit tests run in Node (fetch, FormData, Blob, Response and WebCrypto
// are global there as in workerd). Bindings are in-memory fakes.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 20000,
  },
});

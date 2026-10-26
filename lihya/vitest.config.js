import { defineConfig } from 'vitest/config';

// Unit tests: pure logic (color, scale, face shape, recommend, cut card, dayKey, csv...).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    testTimeout: 20000,
  },
});

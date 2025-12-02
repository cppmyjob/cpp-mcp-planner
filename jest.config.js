/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol/sdk)/)',
  ],
  modulePathIgnorePatterns: [],
  collectCoverageFrom: [
    'src/**/*.ts',
    // Exclude bootstrap/entry point files
    '!src/index.ts',
    // Exclude MCP SDK wrapper (tested indirectly via tool-handlers)
    '!src/server/create-server.ts',
    // Exclude static tool definitions (no logic to test)
    '!src/server/tool-definitions.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

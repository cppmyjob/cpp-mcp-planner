/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@mcp-planner/core$': '<rootDir>/packages/core/src/index.ts',
    '^@mcp-planner/mcp-server$': '<rootDir>/packages/mcp-server/src/index.ts',
    '^@mcp-planner/web-server$': '<rootDir>/packages/web-server/src/index.ts',
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
  // web-server E2E tests have their own jest.config.js due to NestJS decorator requirements
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol/sdk)/)',
  ],
  modulePathIgnorePatterns: [],
  collectCoverageFrom: [
    'packages/core/src/**/*.ts',
    'packages/mcp-server/src/**/*.ts',
    'packages/web-server/src/**/*.ts',
    // Exclude bootstrap/entry point files
    '!packages/mcp-server/src/cli.ts',
    '!packages/web-server/src/main.ts',
    '!packages/*/src/index.ts',
    // Exclude MCP SDK wrapper (tested indirectly via tool-handlers)
    '!packages/mcp-server/src/server/create-server.ts',
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

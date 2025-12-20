/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@mcp-planner/core$': '<rootDir>/../core/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          target: 'ES2022',
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
  testMatch: ['**/test/**/*.e2e-spec.ts'],
  setupFiles: ['./test/jest-setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/index.ts'],
  coverageDirectory: '../../.test-output/coverage-web-server',
  verbose: true,
};

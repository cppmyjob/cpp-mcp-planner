import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED PHASE - REQ-9: SQL LIKE Search Implementation
 *
 * E2E tests for SQL LIKE-compatible search in query service:
 * - Wildcard % (matches any sequence of characters)
 * - Wildcard _ (matches single character)
 * - Case-insensitive search
 * - Plain text search (no wildcards)
 * - Empty pattern returns all entities
 *
 * These tests should FAIL initially, then PASS after GREEN phase implementation.
 */

// Helper to retry directory removal on Windows
async function removeDirectoryWithRetry(dir: string, maxRetries = 3): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
    }
  }
}

// Helper to parse MCP tool result
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function parseResult<T>(result: unknown): T {
  const r = result as { content: { type: string; text: string }[] };
  return JSON.parse(r.content[0].text) as T;
}

describe('E2E: Query Service - SQL LIKE Search (RED Phase)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;
  let planId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'query-sql-like-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath, 'test-project');
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'query-sql-like-test', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async (): Promise<void> => {
      await client.close();
      await server.close();
      await removeDirectoryWithRetry(storagePath);
    };

    // Setup: Create test plan
    const planResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'SQL LIKE Search Test Plan',
        description: 'Testing SQL LIKE search functionality',
      },
    });
    const plan = parseResult<{ planId: string }>(planResult);
    planId = plan.planId;

    // Setup: Create test requirements with various titles
    await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'User Authentication Service',
          description: 'Implement user authentication',
          category: 'functional',
          priority: 'high',
          source: { type: 'user-request' },
          impact: { scope: ['auth'], complexityEstimate: 5, riskLevel: 'medium' },
        },
      },
    });

    await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'Database Service Layer',
          description: 'Create database abstraction',
          category: 'technical',
          priority: 'critical',
          source: { type: 'user-request' },
          impact: { scope: ['db'], complexityEstimate: 8, riskLevel: 'high' },
        },
      },
    });

    await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'API Gateway',
          description: 'Setup API gateway',
          category: 'technical',
          priority: 'high',
          source: { type: 'user-request' },
          impact: { scope: ['api'], complexityEstimate: 6, riskLevel: 'medium' },
        },
      },
    });

    await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'Service Discovery',
          description: 'Implement service discovery',
          category: 'technical',
          priority: 'medium',
          source: { type: 'user-request' },
          impact: { scope: ['infra'], complexityEstimate: 7, riskLevel: 'medium' },
        },
      },
    });

    await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'Test Coverage',
          description: 'Increase test coverage to 80%',
          category: 'non-functional',
          priority: 'low',
          source: { type: 'user-request' },
          impact: { scope: ['testing'], complexityEstimate: 3, riskLevel: 'low' },
        },
      },
    });
  });

  afterAll(async () => {
    await cleanup();
  });

  // ============================================================
  // RED: Wildcard % - Match any sequence of characters
  // ============================================================
  describe('SQL LIKE: Wildcard % (any characters)', () => {
    it('RED: should find all entities with "Service" using %Service%', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '%Service%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "User Authentication Service", "Database Service Layer", "Service Discovery"
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.results.length).toBeGreaterThanOrEqual(3);
    });

    it('RED: should find entities starting with "Database" using Database%', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: 'Database%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "Database Service Layer"
      expect(result.total).toBe(1);
    });

    it('RED: should find entities ending with "Gateway" using %Gateway', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '%Gateway',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "API Gateway"
      expect(result.total).toBe(1);
    });

    it('RED: should return all entities with % wildcard alone', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match all 5 requirements
      expect(result.total).toBe(5);
    });
  });

  // ============================================================
  // RED: Wildcard _ - Match single character
  // ============================================================
  describe('SQL LIKE: Wildcard _ (single character)', () => {
    it('RED: should match single character using _est', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '_est',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "Test Coverage" (Test contains "Test")
      expect(result.total).toBeGreaterThanOrEqual(1);
    });

    it('RED: should match pattern with multiple _ wildcards', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: 'S__vice',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "Service" (er = two chars)
      expect(result.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // RED: Case-insensitive search
  // ============================================================
  describe('SQL LIKE: Case-insensitive search', () => {
    it('RED: should find matches regardless of case - uppercase', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '%SERVICE%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "User Authentication Service", "Database Service Layer", "Service Discovery"
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    it('RED: should find matches regardless of case - lowercase', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '%service%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "User Authentication Service", "Database Service Layer", "Service Discovery"
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    it('RED: should find matches with mixed case', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '%SeRvIcE%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "User Authentication Service", "Database Service Layer", "Service Discovery"
      expect(result.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================
  // RED: Plain text search (no wildcards)
  // ============================================================
  describe('SQL LIKE: Plain text search', () => {
    it('RED: should match plain text without wildcards', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: 'API',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "API Gateway"
      expect(result.total).toBe(1);
    });

    it('RED: should match partial word as substring', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: 'auth',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "User Authentication Service"
      expect(result.total).toBe(1);
    });
  });

  // ============================================================
  // RED: Combined wildcards
  // ============================================================
  describe('SQL LIKE: Combined wildcards', () => {
    it('RED: should combine % and _ wildcards', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: 'S_rv%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "Service" patterns (Se + rv + anything)
      expect(result.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // RED: Empty pattern
  // ============================================================
  describe('SQL LIKE: Empty pattern', () => {
    it('RED: should return all entities for empty string', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match all 5 requirements (empty string matches everything)
      expect(result.total).toBe(5);
    });
  });

  // ============================================================
  // RED: Special case - search in descriptions
  // ============================================================
  describe('SQL LIKE: Search in multiple fields', () => {
    it('RED: should search in description field with wildcards', async () => {
      const searchResult = await client.callTool({
        name: 'query',
        arguments: {
          action: 'search',
          planId,
          query: '%abstraction%',
        },
      });

      const result = parseResult<{ results: unknown[]; total: number }>(searchResult);

      // Should match: "Database Service Layer" (description: "Create database abstraction")
      expect(result.total).toBe(1);
    });
  });
});

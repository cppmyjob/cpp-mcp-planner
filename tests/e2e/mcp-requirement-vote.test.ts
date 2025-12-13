import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '../../src/server/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Helper to parse MCP tool result
function parseResult<T>(result: unknown): T {
  const r = result as { content: { type: string; text: string }[] };
  return JSON.parse(r.content[0].text) as T;
}

/**
 * E2E tests for requirement voting system via MCP tool
 *
 * TDD RED Phase: These tests will fail until vote/unvote actions are implemented
 */
describe('E2E: Requirement Voting via MCP Tool', () => {
  let storagePath: string;
  let client: Client;
  let planId: string;

  beforeAll(async () => {
    storagePath = path.join(process.cwd(), '.test-temp', 'mcp-vote-' + Date.now() + '-' + crypto.randomUUID());
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // Create a test plan
    const createResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Voting Test Plan',
        description: 'Testing vote/unvote actions',
      },
    });

    planId = parseResult<{ planId: string }>(createResult).planId;
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(storagePath, { recursive: true, force: true });
  });

  describe('vote action', () => {
    it('should initialize votes to 0 for new requirement', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Feature Request',
            description: 'New feature',
            source: { type: 'user-request' },
            acceptanceCriteria: ['Works'],
            priority: 'high',
            category: 'functional',
          },
        },
      });

      const { requirementId } = parseResult<{ requirementId: string }>(addResult);

      const getResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId,
        },
      });

      const data = parseResult<{ requirement: { votes: number } }>(getResult);
      expect(data.requirement.votes).toBe(0);
    });

    it('should increase votes via vote action', async () => {
      // Add requirement
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Votable Feature',
            description: 'Can be voted on',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional',
          },
        },
      });

      const { requirementId } = parseResult<{ requirementId: string }>(addResult);

      // Vote for it
      const voteResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'vote',
          planId,
          requirementId,
        },
      });

      const voteData = parseResult<{ success: boolean; votes: number }>(voteResult);
      expect(voteData.success).toBe(true);
      expect(voteData.votes).toBe(1);

      // Verify via get
      const getResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId,
        },
      });

      const getData = parseResult<{ requirement: { votes: number } }>(getResult);
      expect(getData.requirement.votes).toBe(1);
    });

    it('should support multiple votes', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Popular Feature',
            description: 'Gets many votes',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'critical',
            category: 'functional',
          },
        },
      });

      const { requirementId } = parseResult<{ requirementId: string }>(addResult);

      // Vote multiple times
      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId },
      });

      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId },
      });

      const vote3Result = await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId },
      });

      const vote3Data = parseResult<{ votes: number }>(vote3Result);
      expect(vote3Data.votes).toBe(3);
    });

    it('should throw error for non-existent requirement', async () => {
      await expect(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'vote',
            planId,
            requirementId: 'non-existent-id',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('unvote action', () => {
    it('should decrease votes via unvote action', async () => {
      // Add requirement
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Unvotable Feature',
            description: 'Can be unvoted',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional',
          },
        },
      });

      const { requirementId } = parseResult<{ requirementId: string }>(addResult);

      // Vote twice
      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId },
      });

      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId },
      });

      // Unvote once
      const unvoteResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'unvote',
          planId,
          requirementId,
        },
      });

      const unvoteData = parseResult<{ success: boolean; votes: number }>(unvoteResult);
      expect(unvoteData.success).toBe(true);
      expect(unvoteData.votes).toBe(1);

      // Verify via get
      const getResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'get',
          planId,
          requirementId,
        },
      });

      const getData = parseResult<{ requirement: { votes: number } }>(getResult);
      expect(getData.requirement.votes).toBe(1);
    });

    it('should not allow negative votes', async () => {
      const addResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Zero Votes Feature',
            description: 'Has no votes',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'low',
            category: 'functional',
          },
        },
      });

      const { requirementId } = parseResult<{ requirementId: string }>(addResult);

      // Try to unvote when votes = 0
      await expect(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'unvote',
            planId,
            requirementId,
          },
        })
      ).rejects.toThrow();
    });

    it('should throw error for non-existent requirement', async () => {
      await expect(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'unvote',
            planId,
            requirementId: 'non-existent-id',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('vote display in list', () => {
    it('should display votes in requirement list', async () => {
      // Add multiple requirements with different vote counts
      const req1 = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Low Priority',
            description: 'Few votes',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'low',
            category: 'functional',
          },
        },
      });
      const req1Id = parseResult<{ requirementId: string }>(req1).requirementId;

      const req2 = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'High Priority',
            description: 'Many votes',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
      });
      const req2Id = parseResult<{ requirementId: string }>(req2).requirementId;

      // Vote for req2 multiple times
      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId: req2Id },
      });

      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId: req2Id },
      });

      await client.callTool({
        name: 'requirement',
        arguments: { action: 'vote', planId, requirementId: req2Id },
      });

      // List all requirements
      const listResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'list',
          planId,
        },
      });

      const listData = parseResult<{ requirements: { id: string; votes: number }[] }>(
        listResult
      );

      const req1Data = listData.requirements.find((r) => r.id === req1Id);
      const req2Data = listData.requirements.find((r) => r.id === req2Id);

      expect(req1Data?.votes).toBe(0);
      expect(req2Data?.votes).toBe(3);
    });
  });
});

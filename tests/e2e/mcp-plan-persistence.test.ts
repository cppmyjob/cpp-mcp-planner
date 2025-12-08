import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '../../src/server/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Helper to parse MCP tool result
function parseResult<T>(result: unknown): T {
  const r = result as { content: Array<{ type: string; text: string }> };
  return JSON.parse(r.content[0].text) as T;
}

/**
 * E2E tests for plan set_active/get_active persistence
 *
 * Tests the critical requirement: active plan mapping must persist across server restarts
 */
describe('E2E: Plan set_active/get_active Persistence', () => {
  let storagePath: string;

  beforeAll(async () => {
    storagePath = path.join(process.cwd(), '.test-temp', 'mcp-plan-persistence-' + Date.now() + '-' + crypto.randomUUID());
    await fs.mkdir(storagePath, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(storagePath, { recursive: true, force: true });
  });

  it('should persist active plan mapping across server restart', async () => {
    // === PHASE 1: Create server, create plan, set active ===
    const services1 = await createServices(storagePath);
    const { server: server1 } = createMcpServer(services1);
    const [clientTransport1, serverTransport1] = InMemoryTransport.createLinkedPair();

    const client1 = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server1.connect(serverTransport1);
    await client1.connect(clientTransport1);

    // Create a plan
    const createResult = await client1.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Test Plan for Persistence',
        description: 'Testing active plan persistence',
      },
    });

    const { planId } = parseResult<{ planId: string }>(createResult);
    expect(planId).toBeDefined();

    // Set it as active
    const setActiveResult = await client1.callTool({
      name: 'plan',
      arguments: {
        action: 'set_active',
        planId,
      },
    });

    // Verify get_active returns the planId
    const getActiveResult1 = await client1.callTool({
      name: 'plan',
      arguments: {
        action: 'get_active',
      },
    });
    const activeData1 = parseResult<{ activePlan: { planId: string } }>(getActiveResult1);
    expect(activeData1.activePlan.planId).toBe(planId);

    // Close first server
    await client1.close();
    await server1.close();

    // === PHASE 2: Create NEW server with SAME storagePath ===
    const services2 = await createServices(storagePath);
    const { server: server2 } = createMcpServer(services2);
    const [clientTransport2, serverTransport2] = InMemoryTransport.createLinkedPair();

    const client2 = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server2.connect(serverTransport2);
    await client2.connect(clientTransport2);

    // === CRITICAL TEST: get_active should return saved planId after restart ===
    const getActiveResult2 = await client2.callTool({
      name: 'plan',
      arguments: {
        action: 'get_active',
      },
    });
    const activeData2 = parseResult<{ activePlan: { planId: string } | null }>(getActiveResult2);
    expect(activeData2.activePlan).not.toBeNull();
    expect(activeData2.activePlan!.planId).toBe(planId);

    // Clean up second server
    await client2.close();
    await server2.close();
  });

  it('should return null when no active plan is set', async () => {
    // Create fresh storage to ensure no active plan exists
    const freshStoragePath = path.join(process.cwd(), '.test-temp', 'mcp-plan-persistence-null-' + Date.now());
    await fs.mkdir(freshStoragePath, { recursive: true });

    const services = await createServices(freshStoragePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const getActiveResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'get_active',
      },
    });

    const activeData = parseResult<{ activePlan: null }>(getActiveResult);
    expect(activeData.activePlan).toBeNull();

    await client.close();
    await server.close();
    await fs.rm(freshStoragePath, { recursive: true, force: true });
  });

  it('should throw error when setting non-existent plan as active', async () => {
    const errorStoragePath = path.join(process.cwd(), '.test-temp', 'mcp-plan-persistence-error-' + Date.now());
    await fs.mkdir(errorStoragePath, { recursive: true });

    const services = await createServices(errorStoragePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    await expect(
      client.callTool({
        name: 'plan',
        arguments: {
          action: 'set_active',
          planId: 'non-existent-plan-id',
        },
      })
    ).rejects.toThrow(/plan not found/i);

    await client.close();
    await server.close();
    await fs.rm(errorStoragePath, { recursive: true, force: true });
  });

  it('should overwrite previous active plan when setting new one', async () => {
    const overwriteStoragePath = path.join(process.cwd(), '.test-temp', 'mcp-plan-persistence-overwrite-' + Date.now());
    await fs.mkdir(overwriteStoragePath, { recursive: true });

    const services = await createServices(overwriteStoragePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // Create first plan
    const createResult1 = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'First Plan',
        description: 'Testing overwrite',
      },
    });

    const { planId: planId1 } = parseResult<{ planId: string }>(createResult1);

    // Set as active
    await client.callTool({
      name: 'plan',
      arguments: {
        action: 'set_active',
        planId: planId1,
      },
    });

    // Create second plan
    const createResult2 = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Second Plan',
        description: 'Testing overwrite',
      },
    });

    const { planId: planId2 } = parseResult<{ planId: string }>(createResult2);

    // Set second as active (should overwrite first)
    await client.callTool({
      name: 'plan',
      arguments: {
        action: 'set_active',
        planId: planId2,
      },
    });

    // Verify get_active returns second planId
    const getActiveResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'get_active',
      },
    });

    const activeData = parseResult<{ activePlan: { planId: string } }>(getActiveResult);
    expect(activeData.activePlan.planId).toBe(planId2);
    expect(activeData.activePlan.planId).not.toBe(planId1);

    await client.close();
    await server.close();
    await fs.rm(overwriteStoragePath, { recursive: true, force: true });
  });
});

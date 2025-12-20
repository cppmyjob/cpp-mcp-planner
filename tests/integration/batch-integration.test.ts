/**
 * Integration Tests: BatchService
 *
 * Tests 32-40 cover real FileStorage integration:
 * - Disk persistence
 * - Statistics updates
 * - Rollback integrity
 * - Large batches
 * - Dependency trees
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
  type Decision,
  type Artifact,
  type Entity,
  type Link,
} from '@mcp-planner/core';
import { FileRepositoryFactory, FileLockManager, type RepositoryFactory } from '@mcp-planner/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Helper functions to replace storage.loadEntities/loadLinks
async function loadEntities<T extends Entity>(
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = repositoryFactory.createRepository<T>(typeMap[entityType] as any, planId);
  return repo.findAll();
}

async function loadLinks(
  repositoryFactory: RepositoryFactory,
  planId: string
): Promise<Link[]> {
  const linkRepo = repositoryFactory.createLinkRepository(planId);
  return linkRepo.findAllLinks();
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

describe('BatchService - Integration Tests', () => {
  let batchService: BatchService;
  let planService: PlanService;
  let requirementService: RequirementService;
  let solutionService: SolutionService;
  let phaseService: PhaseService;
  let linkingService: LinkingService;
  let decisionService: DecisionService;
  let artifactService: ArtifactService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = path.join(os.tmpdir(), `mcp-batch-test-${Date.now().toString()}`);

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

    // Initialize all services
    planService = new PlanService(repositoryFactory);
    requirementService = new RequirementService(repositoryFactory, planService);
    solutionService = new SolutionService(repositoryFactory, planService);
    phaseService = new PhaseService(repositoryFactory, planService);
    linkingService = new LinkingService(repositoryFactory);
    decisionService = new DecisionService(repositoryFactory, planService);
    artifactService = new ArtifactService(repositoryFactory, planService);

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

    // Create test plan
    const { planId } = await planService.createPlan({
      name: 'Batch Integration Test Plan',
      description: 'Testing batch operations with real storage',
    });
    testPlanId = planId;
  });

  afterEach(async () => {
    await repositoryFactory.close();
    await lockManager.dispose();
    await removeDirectoryWithRetry(testDir);
  });

  it('Test 32: Real FileStorage integration - batch creates entities on disk', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            title: 'Req 1',
            description: 'First requirement',
            source: { type: 'user-request' },
            acceptanceCriteria: ['AC1'],
            priority: 'high',
            category: 'functional',
          },
        },
        {
          entityType: 'requirement',
          payload: {
            title: 'Req 2',
            description: 'Second requirement',
            source: { type: 'user-request' },
            acceptanceCriteria: ['AC2'],
            priority: 'medium',
            category: 'functional',
          },
        },
      ],
    });

    // Verify batch succeeded
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(true);

    // Verify entities persisted to disk by reading directly
    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    expect(requirements).toHaveLength(2);
    expect(requirements[0].title).toBe('Req 1');
    expect(requirements[1].title).toBe('Req 2');
  });

  it('Test 33: Multiple batches sequentially - verify persistence', async () => {
    // First batch
    await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            title: 'Batch 1 Req',
            description: 'From first batch',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
      ],
    });

    // Second batch
    await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            title: 'Batch 2 Req',
            description: 'From second batch',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional',
          },
        },
      ],
    });

    // Verify both batches persisted
    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    expect(requirements).toHaveLength(2);
    expect(requirements[0].title).toBe('Batch 1 Req');
    expect(requirements[1].title).toBe('Batch 2 Req');
  });

  it('Test 34: Batch rollback does not write to disk', async () => {
    try {
      await batchService.executeBatch({
        planId: testPlanId,
        operations: [
          {
            entityType: 'requirement',
            payload: {
              title: 'Valid Req',
              description: 'This should work',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'high',
              category: 'functional',
            },
          },
          {
            entityType: 'requirement',
            payload: {
              // Missing required fields
              title: '',
              description: '',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'high',
              category: 'functional',
            },
          },
        ],
      });
      throw new Error('Should have thrown validation error');
    } catch (error: unknown) {
      expect((error as Error).message).toContain('title must be a non-empty string');
    }

    // Verify nothing was written to disk
    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    expect(requirements).toHaveLength(0);
  });

  it('Test 35: Statistics updated once after batch', async () => {
    await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
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
            title: 'Req 3',
            description: 'Third',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional',
          },
        },
      ],
    });

    // Verify statistics updated
    const { plan } = await planService.getPlan({ planId: testPlanId });
    expect(plan.manifest.statistics.totalRequirements).toBe(3);
  });

  it('Test 36: Temp IDs in links persist correctly', async () => {
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
          entityType: 'solution',
          payload: {
            tempId: '$1',
            title: 'Solution',
            description: 'Implements parent',
            addressing: ['$0'],
            approach: 'Test approach',
          },
        },
        {
          entityType: 'link',
          payload: {
            sourceId: '$1',
            targetId: '$0',
            relationType: 'implements',
          },
        },
      ],
    });

    // Verify link persisted with resolved IDs
    const links = await loadLinks(repositoryFactory, testPlanId);
    expect(links).toHaveLength(1);
    expect(links[0].sourceId).toBe(result.results[1].id); // Solution ID
    expect(links[0].targetId).toBe(result.results[0].id); // Requirement ID
    expect(links[0].relationType).toBe('implements');
  });

  it('Test 37: Large batch (50 entities) succeeds', async () => {
    const operations = [];
    for (let i = 0; i < 50; i++) {
      operations.push({
        entityType: 'requirement' as const,
        payload: {
          title: `Requirement ${i.toString()}`,
          description: `Description ${i.toString()}`,
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

    expect(result.results).toHaveLength(50);
    expect(result.results.every((r) => r.success)).toBe(true);

    // Verify all persisted
    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    expect(requirements).toHaveLength(50);
  }, 30000); // Increase timeout for large batch operation under parallel test load

  it('Test 38: Batch creates full dependency tree', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        // Requirements
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Main Requirement',
            description: 'Top level requirement',
            source: { type: 'user-request' },
            acceptanceCriteria: ['AC1'],
            priority: 'high',
            category: 'functional',
          },
        },
        // Solution
        {
          entityType: 'solution',
          payload: {
            tempId: '$1',
            title: 'Implementation Solution',
            description: 'How to implement',
            addressing: ['$0'],
            approach: 'TDD approach',
          },
        },
        // Phases
        {
          entityType: 'phase',
          payload: {
            tempId: '$2',
            title: 'Phase 1',
            description: 'First phase',
            objectives: ['Implement feature'],
            deliverables: ['Working code'],
          },
        },
        {
          entityType: 'phase',
          payload: {
            tempId: '$3',
            title: 'Phase 1.1',
            description: 'Sub-phase',
            parentId: '$2',
            objectives: ['Sub-task'],
            deliverables: ['Sub-deliverable'],
          },
        },
        // Links
        {
          entityType: 'link',
          payload: {
            sourceId: '$1',
            targetId: '$0',
            relationType: 'implements',
          },
        },
        {
          entityType: 'link',
          payload: {
            sourceId: '$2',
            targetId: '$0',
            relationType: 'addresses',
          },
        },
      ],
    });

    // Verify all entities created
    expect(result.results).toHaveLength(6);
    expect(result.results.every((r) => r.success)).toBe(true);

    // Verify dependency tree persisted
    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    const solutions = await loadEntities<Solution>(repositoryFactory, testPlanId, 'solutions');
    const phases = await loadEntities<Phase>(repositoryFactory, testPlanId, 'phases');
    const links = await loadLinks(repositoryFactory, testPlanId);

    expect(requirements).toHaveLength(1);
    expect(solutions).toHaveLength(1);
    expect(phases).toHaveLength(2);
    expect(links).toHaveLength(2);

    // Verify phase hierarchy
    const phase1 = phases.find((p) => p.title === 'Phase 1');
    const phase11 = phases.find((p) => p.title === 'Phase 1.1');
    expect(phase11).toBeDefined();
    expect(phase1).toBeDefined();
    if (!phase11 || !phase1) throw new Error('Phases should be defined');
    expect(phase11.parentId).toBe(phase1.id);
  });

  it('Test 39: Batch with all entity types', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entityType: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Requirement',
            description: 'Test requirement',
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
            title: 'Solution',
            description: 'Test solution',
            addressing: ['$0'],
            approach: 'Approach',
          },
        },
        {
          entityType: 'phase',
          payload: {
            tempId: '$2',
            title: 'Phase',
            description: 'Test phase',
            objectives: [],
            deliverables: [],
          },
        },
        {
          entityType: 'decision',
          payload: {
            tempId: '$3',
            title: 'Decision',
            question: 'What to do?',
            context: 'Context',
            decision: 'Do it',
            consequences: 'Good things',
          },
        },
        {
          entityType: 'artifact',
          payload: {
            tempId: '$4',
            title: 'Artifact',
            description: 'Test artifact',
            artifactType: 'code',
            relatedPhaseId: '$2',
          },
        },
        {
          entityType: 'link',
          payload: {
            sourceId: '$1',
            targetId: '$0',
            relationType: 'implements',
          },
        },
      ],
    });

    expect(result.results).toHaveLength(6);
    expect(result.results.every((r) => r.success)).toBe(true);

    // Verify all persisted
    const requirements = await loadEntities<Requirement>(repositoryFactory, testPlanId, 'requirements');
    const solutions = await loadEntities<Solution>(repositoryFactory, testPlanId, 'solutions');
    const phases = await loadEntities<Phase>(repositoryFactory, testPlanId, 'phases');
    const decisions = await loadEntities<Decision>(repositoryFactory, testPlanId, 'decisions');
    const artifacts = await loadEntities<Artifact>(repositoryFactory, testPlanId, 'artifacts');
    const links = await loadLinks(repositoryFactory, testPlanId);

    expect(requirements).toHaveLength(1);
    expect(solutions).toHaveLength(1);
    expect(phases).toHaveLength(1);
    expect(decisions).toHaveLength(1);
    expect(artifacts).toHaveLength(1);
    expect(links).toHaveLength(1);
  });
});

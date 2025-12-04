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
import { BatchService } from '../../src/domain/services/batch-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { PhaseService } from '../../src/domain/services/phase-service.js';
import { LinkingService } from '../../src/domain/services/linking-service.js';
import { DecisionService } from '../../src/domain/services/decision-service.js';
import { ArtifactService } from '../../src/domain/services/artifact-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import type { Requirement, Solution, Phase, Decision, Artifact } from '../../src/domain/entities/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('BatchService - Integration Tests', () => {
  let batchService: BatchService;
  let planService: PlanService;
  let requirementService: RequirementService;
  let solutionService: SolutionService;
  let phaseService: PhaseService;
  let linkingService: LinkingService;
  let decisionService: DecisionService;
  let artifactService: ArtifactService;
  let storage: FileStorage;
  let testDir: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = path.join(os.tmpdir(), `mcp-batch-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();

    // Initialize all services
    planService = new PlanService(storage);
    requirementService = new RequirementService(storage, planService);
    solutionService = new SolutionService(storage, planService);
    phaseService = new PhaseService(storage, planService);
    linkingService = new LinkingService(storage);
    decisionService = new DecisionService(storage, planService);
    artifactService = new ArtifactService(storage, planService);

    batchService = new BatchService(
      storage,
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
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('Test 32: Real FileStorage integration - batch creates entities on disk', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entity_type: 'requirement',
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
          entity_type: 'requirement',
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
    const requirements = await storage.loadEntities<Requirement>(testPlanId, 'requirements');
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
          entity_type: 'requirement',
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
          entity_type: 'requirement',
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
    const requirements = await storage.loadEntities<Requirement>(testPlanId, 'requirements');
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
            entity_type: 'requirement',
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
            entity_type: 'requirement',
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
    } catch (error: any) {
      expect(error.message).toContain('Title is required');
    }

    // Verify nothing was written to disk
    const requirements = await storage.loadEntities<Requirement>(testPlanId, 'requirements');
    expect(requirements).toHaveLength(0);
  });

  it('Test 35: Statistics updated once after batch', async () => {
    await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entity_type: 'requirement',
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
          entity_type: 'requirement',
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
          entity_type: 'requirement',
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
          entity_type: 'requirement',
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
          entity_type: 'solution',
          payload: {
            tempId: '$1',
            title: 'Solution',
            description: 'Implements parent',
            addressing: ['$0'],
            approach: 'Test approach',
          },
        },
        {
          entity_type: 'link',
          payload: {
            sourceId: '$1',
            targetId: '$0',
            relationType: 'implements',
          },
        },
      ],
    });

    // Verify link persisted with resolved IDs
    const links = await storage.loadLinks(testPlanId);
    expect(links).toHaveLength(1);
    expect(links[0].sourceId).toBe(result.results[1].id); // Solution ID
    expect(links[0].targetId).toBe(result.results[0].id); // Requirement ID
    expect(links[0].relationType).toBe('implements');
  });

  it('Test 37: Large batch (50 entities) succeeds', async () => {
    const operations = [];
    for (let i = 0; i < 50; i++) {
      operations.push({
        entity_type: 'requirement' as const,
        payload: {
          title: `Requirement ${i}`,
          description: `Description ${i}`,
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
    const requirements = await storage.loadEntities<Requirement>(testPlanId, 'requirements');
    expect(requirements).toHaveLength(50);
  });

  it('Test 38: Batch creates full dependency tree', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        // Requirements
        {
          entity_type: 'requirement',
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
          entity_type: 'solution',
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
          entity_type: 'phase',
          payload: {
            tempId: '$2',
            title: 'Phase 1',
            description: 'First phase',
            objectives: ['Implement feature'],
            deliverables: ['Working code'],
          },
        },
        {
          entity_type: 'phase',
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
          entity_type: 'link',
          payload: {
            sourceId: '$1',
            targetId: '$0',
            relationType: 'implements',
          },
        },
        {
          entity_type: 'link',
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
    const requirements = await storage.loadEntities<Requirement>(testPlanId, 'requirements');
    const solutions = await storage.loadEntities<Solution>(testPlanId, 'solutions');
    const phases = await storage.loadEntities<Phase>(testPlanId, 'phases');
    const links = await storage.loadLinks(testPlanId);

    expect(requirements).toHaveLength(1);
    expect(solutions).toHaveLength(1);
    expect(phases).toHaveLength(2);
    expect(links).toHaveLength(2);

    // Verify phase hierarchy
    const phase1 = phases.find((p) => p.title === 'Phase 1');
    const phase11 = phases.find((p) => p.title === 'Phase 1.1');
    expect(phase11).toBeDefined();
    expect(phase1).toBeDefined();
    expect(phase11!.parentId).toBe(phase1!.id);
  });

  it('Test 39: Batch with all entity types', async () => {
    const result = await batchService.executeBatch({
      planId: testPlanId,
      operations: [
        {
          entity_type: 'requirement',
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
          entity_type: 'solution',
          payload: {
            tempId: '$1',
            title: 'Solution',
            description: 'Test solution',
            addressing: ['$0'],
            approach: 'Approach',
          },
        },
        {
          entity_type: 'phase',
          payload: {
            tempId: '$2',
            title: 'Phase',
            description: 'Test phase',
            objectives: [],
            deliverables: [],
          },
        },
        {
          entity_type: 'decision',
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
          entity_type: 'artifact',
          payload: {
            tempId: '$4',
            title: 'Artifact',
            description: 'Test artifact',
            artifactType: 'code',
            relatedPhaseId: '$2',
          },
        },
        {
          entity_type: 'link',
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
    const requirements = await storage.loadEntities<Requirement>(testPlanId, 'requirements');
    const solutions = await storage.loadEntities<Solution>(testPlanId, 'solutions');
    const phases = await storage.loadEntities<Phase>(testPlanId, 'phases');
    const decisions = await storage.loadEntities<Decision>(testPlanId, 'decisions');
    const artifacts = await storage.loadEntities<Artifact>(testPlanId, 'artifacts');
    const links = await storage.loadLinks(testPlanId);

    expect(requirements).toHaveLength(1);
    expect(solutions).toHaveLength(1);
    expect(phases).toHaveLength(1);
    expect(decisions).toHaveLength(1);
    expect(artifacts).toHaveLength(1);
    expect(links).toHaveLength(1);
  });
});

/**
 * Unit Tests: BatchService
 *
 * Tests 1-17 cover core BatchService functionality:
 * - Empty operations
 * - Single/multiple entity creation
 * - Temp ID resolution
 * - Rollback on error
 * - Pre-validation
 * - Mixed entity types
 * - Statistics updates
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BatchService } from '../../src/domain/services/batch-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { PhaseService } from '../../src/domain/services/phase-service.js';
import { LinkingService } from '../../src/domain/services/linking-service.js';
import { DecisionService } from '../../src/domain/services/decision-service.js';
import { ArtifactService } from '../../src/domain/services/artifact-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('BatchService - Unit Tests', () => {
  let batchService: BatchService;
  let storage: FileStorage;
  let planService: PlanService;
  let requirementService: RequirementService;
  let solutionService: SolutionService;
  let phaseService: PhaseService;
  let linkingService: LinkingService;
  let decisionService: DecisionService;
  let artifactService: ArtifactService;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-batch-unit-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();

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

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For batch testing',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Test 1: executeBatch с пустым массивом операций
   * RED → GREEN → REFACTOR
   */
  it('Test 1: executeBatch with empty operations array returns empty result', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: []
    });

    expect(result.results).toEqual([]);
    expect(result.tempIdMapping).toEqual({});
  });

  /**
   * Test 2: executeBatch создаёт один requirement
   * RED → GREEN → REFACTOR
   */
  it('Test 2: executeBatch creates single requirement', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'requirement',
          payload: {
            title: 'Test Requirement',
            description: 'Test description',
            source: { type: 'user-request' },
            acceptanceCriteria: ['AC1'],
            priority: 'high',
            category: 'functional'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].id).toMatch(/^[a-f0-9-]{36}$/);

    // Verify entity created in storage
    const requirements = await storage.loadEntities<any>(planId, 'requirements');
    expect(requirements).toHaveLength(1);
    expect(requirements[0].title).toBe('Test Requirement');
  });

  /**
   * Test 3: executeBatch создаёт несколько requirements подряд
   * RED → GREEN → REFACTOR
   */
  it('Test 3: executeBatch creates multiple requirements sequentially', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'requirement',
          payload: {
            title: 'Req 1',
            description: 'First',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional'
          }
        },
        {
          entity_type: 'requirement',
          payload: {
            title: 'Req 2',
            description: 'Second',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional'
          }
        },
        {
          entity_type: 'requirement',
          payload: {
            title: 'Req 3',
            description: 'Third',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'low',
            category: 'functional'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(3);
    result.results.forEach(r => expect(r.success).toBe(true));

    const requirements = await storage.loadEntities<any>(planId, 'requirements');
    expect(requirements).toHaveLength(3);
    expect(requirements[0].title).toBe('Req 1');
    expect(requirements[1].title).toBe('Req 2');
    expect(requirements[2].title).toBe('Req 3');
  });

  /**
   * Test 4: executeBatch создаёт phase с временным parentId ($0)
   * RED → GREEN → REFACTOR
   */
  it('Test 4: executeBatch creates phase with temp parentId ($0)', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'phase',
          payload: {
            tempId: '$0',
            title: 'Parent Phase',
            description: 'Root'
          }
        },
        {
          entity_type: 'phase',
          payload: {
            title: 'Child Phase',
            description: 'Child of $0',
            parentId: '$0'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(2);
    expect(result.tempIdMapping['$0']).toBeDefined();

    const phases = await storage.loadEntities<any>(planId, 'phases');
    expect(phases).toHaveLength(2);

    const parent = phases.find((p: any) => p.title === 'Parent Phase');
    const child = phases.find((p: any) => p.title === 'Child Phase');

    expect(child.parentId).toBe(parent.id);
    expect(child.depth).toBe(1);
  });

  /**
   * Test 5: executeBatch создаёт link между двумя временными ID ($0 → $1)
   * RED → GREEN → REFACTOR
   */
  it('Test 5: executeBatch creates link between two temp IDs ($0 → $1)', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Requirement 1',
            description: 'First requirement',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional'
          }
        },
        {
          entity_type: 'requirement',
          payload: {
            tempId: '$1',
            title: 'Requirement 2',
            description: 'Second requirement',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'medium',
            category: 'functional'
          }
        },
        {
          entity_type: 'link',
          payload: {
            sourceId: '$0',
            targetId: '$1',
            relationType: 'references'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(3);
    expect(result.tempIdMapping['$0']).toBeDefined();
    expect(result.tempIdMapping['$1']).toBeDefined();

    const links = await storage.loadLinks(planId);
    expect(links).toHaveLength(1);
    expect(links[0].sourceId).toBe(result.tempIdMapping['$0']);
    expect(links[0].targetId).toBe(result.tempIdMapping['$1']);
  });

  /**
   * Test 6: executeBatch при ошибке делает rollback (in-memory)
   * RED → GREEN → REFACTOR
   */
  it('Test 6: executeBatch rolls back all on error (in-memory)', async () => {
    // RequirementService now validates title automatically
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entity_type: 'requirement',
            payload: {
              title: 'Req 1',
              description: 'First',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'high',
              category: 'functional'
            }
          },
          {
            entity_type: 'requirement',
            payload: {
              title: 'Req 2',
              description: 'Second',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'medium',
              category: 'functional'
            }
          },
          {
            entity_type: 'requirement',
            payload: {
              // Missing title - will cause error
              description: 'Third',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'low',
              category: 'functional'
            } as any
          }
        ]
      })
    ).rejects.toThrow('Title is required');

    // Verify rollback - storage should be empty
    const requirements = await storage.loadEntities<any>(planId, 'requirements');
    expect(requirements).toHaveLength(0);
  });

  /**
   * Test 7: executeBatch валидирует операции ДО выполнения (pre-validation)
   * RED → GREEN → REFACTOR
   */
  it('Test 7: executeBatch validates operations before execution', async () => {
    // Test invalid entity_type
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entity_type: 'invalid' as any,
            payload: {}
          }
        ]
      })
    ).rejects.toThrow();

    // Test missing planId
    await expect(
      batchService.executeBatch({
        planId: '',
        operations: []
      })
    ).rejects.toThrow();

    // Test undefined operations
    await expect(
      batchService.executeBatch({
        planId,
        operations: undefined as any
      })
    ).rejects.toThrow();
  });

  /**
   * Test 8: executeBatch возвращает mapping временных ID → реальных
   * RED → GREEN → REFACTOR
   */
  it('Test 8: executeBatch returns tempIdMapping', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Req 1',
            description: 'First',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional'
          }
        },
        {
          entity_type: 'phase',
          payload: {
            tempId: '$1',
            title: 'Phase 1',
            description: 'First phase'
          }
        }
      ]
    });

    expect(result.tempIdMapping).toHaveProperty('$0');
    expect(result.tempIdMapping).toHaveProperty('$1');
    expect(result.tempIdMapping['$0']).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.tempIdMapping['$1']).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.tempIdMapping['$0']).not.toBe(result.tempIdMapping['$1']);
  });

  /**
   * Test 9: executeBatch поддерживает mixed types
   * RED → GREEN → REFACTOR
   */
  it('Test 9: executeBatch supports mixed entity types', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Req 1',
            description: 'Requirement',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional'
          }
        },
        {
          entity_type: 'solution',
          payload: {
            title: 'Sol 1',
            description: 'Solution',
            approach: 'Use library X',
            addressing: ['$0']
          }
        },
        {
          entity_type: 'phase',
          payload: {
            title: 'Phase 1',
            description: 'Implementation phase'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(3);

    const requirements = await storage.loadEntities<any>(planId, 'requirements');
    const solutions = await storage.loadEntities<any>(planId, 'solutions');
    const phases = await storage.loadEntities<any>(planId, 'phases');

    expect(requirements).toHaveLength(1);
    expect(solutions).toHaveLength(1);
    expect(phases).toHaveLength(1);

    // Verify temp ID resolved in addressing
    expect(solutions[0].addressing[0]).toBe(result.tempIdMapping['$0']);
  });

  /**
   * Test 10: executeBatch проверяет тип операции (entity_type)
   * RED → GREEN → REFACTOR
   */
  it('Test 10: executeBatch validates entity_type', async () => {
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entity_type: 'unknown_type' as any,
            payload: {}
          }
        ]
      })
    ).rejects.toThrow(/unknown.*entity.*type/i);
  });

  /**
   * Test 11: executeBatch делегирует валидацию полей сервисам
   * RED → GREEN → REFACTOR
   */
  it('Test 11: executeBatch delegates field validation to services', async () => {
    // RequirementService validates fields automatically
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entity_type: 'requirement',
            payload: {
              description: 'Missing title',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'high',
              category: 'functional'
            } as any
          }
        ]
      })
    ).rejects.toThrow('Title is required');

    // Verify rollback
    const requirements = await storage.loadEntities<any>(planId, 'requirements');
    expect(requirements).toHaveLength(0);
  });

  /**
   * Test 12: executeBatch проверяет существование plan
   * RED → GREEN → REFACTOR
   */
  it('Test 12: executeBatch validates plan exists', async () => {
    await expect(
      batchService.executeBatch({
        planId: 'non-existent-plan-id',
        operations: []
      })
    ).rejects.toThrow(/plan.*not.*found/i);
  });

  /**
   * Test 13: executeBatch резолвит temp IDs в addressing
   * RED → GREEN → REFACTOR
   */
  it('Test 13: executeBatch resolves temp IDs in addressing array', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Req 1',
            description: 'First requirement',
            source: { type: 'user-request' },
            acceptanceCriteria: [],
            priority: 'high',
            category: 'functional'
          }
        },
        {
          entity_type: 'solution',
          payload: {
            title: 'Solution 1',
            description: 'Addresses $0',
            approach: 'Use library X',
            addressing: ['$0']
          }
        }
      ]
    });

    const solutions = await storage.loadEntities<any>(planId, 'solutions');
    expect(solutions[0].addressing).toContain(result.tempIdMapping['$0']);
    expect(solutions[0].addressing).not.toContain('$0');
  });

  /**
   * Test 14: executeBatch резолвит temp IDs только в ID-полях
   * RED → GREEN → REFACTOR
   */
  it('Test 14: executeBatch resolves temp IDs only in ID fields', async () => {
    await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'requirement',
          payload: {
            tempId: '$0',
            title: 'Requirement with $0 in title',
            description: 'Description mentions $0 reference',
            source: { type: 'user-request' },
            acceptanceCriteria: ['Criteria about $0'],
            priority: 'high',
            category: 'functional'
          }
        }
      ]
    });

    const requirements = await storage.loadEntities<any>(planId, 'requirements');

    // Temp IDs should NOT be resolved in non-ID fields
    expect(requirements[0].title).toContain('$0');
    expect(requirements[0].description).toContain('$0');
    expect(requirements[0].acceptanceCriteria[0]).toContain('$0');
  });

  /**
   * Test 15: executeBatch сохраняет порядок выполнения операций
   * RED → GREEN → REFACTOR
   */
  it('Test 15: executeBatch maintains operation execution order', async () => {
    const result = await batchService.executeBatch({
      planId,
      operations: [
        {
          entity_type: 'phase',
          payload: {
            tempId: '$0',
            title: 'Phase 1',
            description: 'First'
          }
        },
        {
          entity_type: 'phase',
          payload: {
            tempId: '$1',
            title: 'Phase 2',
            description: 'Second',
            parentId: '$0'
          }
        },
        {
          entity_type: 'phase',
          payload: {
            tempId: '$2',
            title: 'Phase 3',
            description: 'Third',
            parentId: '$1'
          }
        }
      ]
    });

    const phases = await storage.loadEntities<any>(planId, 'phases');
    expect(phases).toHaveLength(3);

    const phase1 = phases.find((p: any) => p.title === 'Phase 1');
    const phase2 = phases.find((p: any) => p.title === 'Phase 2');
    const phase3 = phases.find((p: any) => p.title === 'Phase 3');

    expect(phase1.depth).toBe(0);
    expect(phase2.depth).toBe(1);
    expect(phase3.depth).toBe(2);
    expect(phase2.parentId).toBe(phase1.id);
    expect(phase3.parentId).toBe(phase2.id);
  });

  /**
   * Test 16: executeBatch обнаруживает циклические зависимости
   * RED → GREEN → REFACTOR
   * Note: Circular dependency detection delegated to LinkingService
   */
  it('Test 16: executeBatch detects circular dependencies in depends_on links', async () => {
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entity_type: 'phase',
            payload: {
              tempId: '$0',
              title: 'Phase A',
              description: 'First'
            }
          },
          {
            entity_type: 'phase',
            payload: {
              tempId: '$1',
              title: 'Phase B',
              description: 'Second'
            }
          },
          {
            entity_type: 'link',
            payload: {
              sourceId: '$0',
              targetId: '$1',
              relationType: 'depends_on'
            }
          },
          {
            entity_type: 'link',
            payload: {
              sourceId: '$1',
              targetId: '$0',
              relationType: 'depends_on'
            }
          }
        ]
      })
    ).rejects.toThrow(/circular.*dependency/i);

    // Verify rollback - nothing created
    const phases = await storage.loadEntities<any>(planId, 'phases');
    const links = await storage.loadLinks(planId);
    expect(phases).toHaveLength(0);
    expect(links).toHaveLength(0);
  });

  /**
   * Test 17: executeBatch делегирует проверку referenced entities сервисам
   * RED → GREEN → REFACTOR
   */
  it('Test 17: executeBatch delegates reference validation to services', async () => {
    // PhaseService should validate parent existence
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entity_type: 'phase',
            payload: {
              title: 'Child Phase',
              description: 'Has non-existent parent',
              parentId: 'non-existent-uuid'
            }
          }
        ]
      })
    ).rejects.toThrow(/parent.*not.*found/i);

    // Verify rollback
    const phases = await storage.loadEntities<any>(planId, 'phases');
    expect(phases).toHaveLength(0);
  });
});

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

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BatchService } from '../../src/domain/services/batch-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { PhaseService } from '../../src/domain/services/phase-service.js';
import { LinkingService } from '../../src/domain/services/linking-service.js';
import { DecisionService } from '../../src/domain/services/decision-service.js';
import { ArtifactService } from '../../src/domain/services/artifact-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Entity, Link, Requirement, Solution, Phase } from '../../src/domain/entities/types.js';

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
  const repo = repositoryFactory.createRepository<T>(typeMap[entityType] as 'requirement', planId);
  return repo.findAll();
}

async function loadLinks(
  repositoryFactory: RepositoryFactory,
  planId: string
): Promise<Link[]> {
  const linkRepo = repositoryFactory.createLinkRepository(planId);
  return linkRepo.findAllLinks();
}

describe('BatchService - Unit Tests', () => {
  let batchService: BatchService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
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
    testDir = path.join(os.tmpdir(), `mcp-batch-unit-${Date.now().toString()}`);

    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    repositoryFactory = new RepositoryFactory({
      type: 'file',
      baseDir: testDir,
      lockManager,
      cacheOptions: { enabled: true, ttl: 5000, maxSize: 1000 }
    });

    const planRepo = repositoryFactory.createPlanRepository();
    await planRepo.initialize();

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

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For batch testing',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  /**
   * Test 1: executeBatch с пустым массивом операций
   * RED → GREEN → REFACTOR
   */
  it('Test 1: executeBatch with empty operations array throws ValidationError', async () => {
    // BUG-026 now covered by E2E test in tool-handlers.test.ts
    await expect(batchService.executeBatch({
      planId,
      operations: []
    })).rejects.toThrow('operations array cannot be empty');
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
          entityType: 'requirement',
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
    const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
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
          entityType: 'requirement',
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
          entityType: 'requirement',
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
          entityType: 'requirement',
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
    result.results.forEach(r => { expect(r.success).toBe(true); });

    const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
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
          entityType: 'phase',
          payload: {
            tempId: '$0',
            title: 'Parent Phase',
            description: 'Root'
          }
        },
        {
          entityType: 'phase',
          payload: {
            title: 'Child Phase',
            description: 'Child of $0',
            parentId: '$0'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(2);
    expect(result.tempIdMapping.$0).toBeDefined();

    const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
    expect(phases).toHaveLength(2);

    const parent = phases.find((p) => p.title === 'Parent Phase');
    const child = phases.find((p) => p.title === 'Child Phase');

    if (parent === undefined) throw new Error('Parent phase should exist');
    if (child === undefined) throw new Error('Child phase should exist');
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
          entityType: 'requirement',
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
          entityType: 'requirement',
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
          entityType: 'link',
          payload: {
            sourceId: '$0',
            targetId: '$1',
            relationType: 'references'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(3);
    expect(result.tempIdMapping.$0).toBeDefined();
    expect(result.tempIdMapping.$1).toBeDefined();

    const links = await loadLinks(repositoryFactory, planId);
    expect(links).toHaveLength(1);
    expect(links[0].sourceId).toBe(result.tempIdMapping.$0);
    expect(links[0].targetId).toBe(result.tempIdMapping.$1);
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
            entityType: 'requirement',
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
            entityType: 'requirement',
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
            entityType: 'requirement',
            payload: {
              // Missing title - will cause error
              description: 'Third',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'low',
              category: 'functional'
            } as unknown as { title: string }
          }
        ]
      })
    ).rejects.toThrow('title is required');

    // Verify rollback - storage should be empty
    const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
    expect(requirements).toHaveLength(0);
  });

  /**
   * Test 7: executeBatch валидирует операции ДО выполнения (pre-validation)
   * RED → GREEN → REFACTOR
   */
  it('Test 7: executeBatch validates operations before execution', async () => {
    // Test invalid entityType
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'invalid' as unknown as 'requirement',
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
        operations: undefined as unknown as []
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
          entityType: 'requirement',
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
          entityType: 'phase',
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
    expect(result.tempIdMapping.$0).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.tempIdMapping.$1).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.tempIdMapping.$0).not.toBe(result.tempIdMapping.$1);
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
          entityType: 'requirement',
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
          entityType: 'solution',
          payload: {
            title: 'Sol 1',
            description: 'Solution',
            approach: 'Use library X',
            addressing: ['$0']
          }
        },
        {
          entityType: 'phase',
          payload: {
            title: 'Phase 1',
            description: 'Implementation phase'
          }
        }
      ]
    });

    expect(result.results).toHaveLength(3);

    const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
    const solutions = await loadEntities<Solution>(repositoryFactory, planId, 'solutions');
    const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');

    expect(requirements).toHaveLength(1);
    expect(solutions).toHaveLength(1);
    expect(phases).toHaveLength(1);

    // Verify temp ID resolved in addressing
    expect(solutions[0].addressing[0]).toBe(result.tempIdMapping.$0);
  });

  /**
   * Test 10: executeBatch проверяет тип операции (entityType)
   * RED → GREEN → REFACTOR
   */
  it('Test 10: executeBatch validates entityType', async () => {
    await expect(
      batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'unknown_type' as unknown as 'requirement',
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
            entityType: 'requirement',
            payload: {
              description: 'Missing title',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'high',
              category: 'functional'
            } as unknown as { title: string }
          }
        ]
      })
    ).rejects.toThrow('title is required');

    // Verify rollback
    const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
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
        operations: [
          {
            entityType: 'requirement',
            payload: {
              title: 'Test',
              description: 'Test',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'low',
              category: 'functional'
            }
          }
        ]
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
          entityType: 'requirement',
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
          entityType: 'solution',
          payload: {
            title: 'Solution 1',
            description: 'Addresses $0',
            approach: 'Use library X',
            addressing: ['$0']
          }
        }
      ]
    });

    const solutions = await loadEntities<Solution>(repositoryFactory, planId, 'solutions');
    expect(solutions[0].addressing).toContain(result.tempIdMapping.$0);
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
          entityType: 'requirement',
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

    const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');

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
    await batchService.executeBatch({
      planId,
      operations: [
        {
          entityType: 'phase',
          payload: {
            tempId: '$0',
            title: 'Phase 1',
            description: 'First'
          }
        },
        {
          entityType: 'phase',
          payload: {
            tempId: '$1',
            title: 'Phase 2',
            description: 'Second',
            parentId: '$0'
          }
        },
        {
          entityType: 'phase',
          payload: {
            tempId: '$2',
            title: 'Phase 3',
            description: 'Third',
            parentId: '$1'
          }
        }
      ]
    });

    const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
    expect(phases).toHaveLength(3);

    const phase1 = phases.find((p) => p.title === 'Phase 1');
    const phase2 = phases.find((p) => p.title === 'Phase 2');
    const phase3 = phases.find((p) => p.title === 'Phase 3');

    if (phase1 === undefined) throw new Error('Phase 1 should exist');
    if (phase2 === undefined) throw new Error('Phase 2 should exist');
    if (phase3 === undefined) throw new Error('Phase 3 should exist');
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
            entityType: 'phase',
            payload: {
              tempId: '$0',
              title: 'Phase A',
              description: 'First'
            }
          },
          {
            entityType: 'phase',
            payload: {
              tempId: '$1',
              title: 'Phase B',
              description: 'Second'
            }
          },
          {
            entityType: 'link',
            payload: {
              sourceId: '$0',
              targetId: '$1',
              relationType: 'depends_on'
            }
          },
          {
            entityType: 'link',
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
    const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
    const links = await loadLinks(repositoryFactory, planId);
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
            entityType: 'phase',
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
    const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
    expect(phases).toHaveLength(0);
  });

  /**
   * TDD RED Phase: Batch Update Operations Tests (будут failing до реализации)
   */
  describe('executeBatch - UPDATE operations', () => {
    it('Test 18: executeBatch should update single requirement', async () => {
      // Create a requirement first
      const req = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Original Title',
          description: 'Original description',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      // Update it via batch
      const result = await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'requirement',
            payload: {
              action: 'update',
              id: req.requirementId,
              updates: {
                title: 'Updated Title',
                priority: 'critical',
              },
            },
          },
        ],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);

      // Verify update
      const { requirement } = await requirementService.getRequirement({
        planId,
        requirementId: req.requirementId,
      });
      expect(requirement.title).toBe('Updated Title');
      expect(requirement.priority).toBe('critical');
      expect(requirement.description).toBe('Original description'); // Unchanged
    });

    it('Test 19: executeBatch should update multiple requirements', async () => {
      // Create requirements
      const req1 = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Req 1',
          description: 'First',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      const req2 = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Req 2',
          description: 'Second',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      // Batch update
      const result = await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'requirement',
            payload: {
              action: 'update',
              id: req1.requirementId,
              updates: { priority: 'critical' },
            },
          },
          {
            entityType: 'requirement',
            payload: {
              action: 'update',
              id: req2.requirementId,
              updates: { priority: 'high' },
            },
          },
        ],
      });

      expect(result.results).toHaveLength(2);

      const { requirement: r1 } = await requirementService.getRequirement({
        planId,
        requirementId: req1.requirementId,
      });
      const { requirement: r2 } = await requirementService.getRequirement({
        planId,
        requirementId: req2.requirementId,
      });

      expect(r1.priority).toBe('critical');
      expect(r2.priority).toBe('high');
    });

    it('Test 20: executeBatch should update phase status', async () => {
      const phase = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Test Phase',
          description: 'Test',
          objectives: ['Complete testing'],
          deliverables: ['Test results'],
          successCriteria: ['All tests pass'],
        },
      });

      const result = await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'phase',
            payload: {
              action: 'update',
              id: phase.phaseId,
              updates: {
                status: 'in_progress',
                progress: 50,
              },
            },
          },
        ],
      });

      expect(result.results[0].success).toBe(true);

      const { phase: updated } = await phaseService.getPhase({
        planId,
        phaseId: phase.phaseId,
      });
      expect(updated.status).toBe('in_progress');
      expect(updated.progress).toBe(50);
    });

    it('Test 21: executeBatch should rollback all updates on error', async () => {
      const req1 = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Req 1',
          description: 'First',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      const req2 = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Req 2',
          description: 'Second',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      // Batch with error in the middle
      await expect(
        batchService.executeBatch({
          planId,
          operations: [
            {
              entityType: 'requirement',
              payload: {
                action: 'update',
                id: req1.requirementId,
                updates: { priority: 'critical' },
              },
            },
            {
              entityType: 'requirement',
              payload: {
                action: 'update',
                id: 'non-existent-id',
                updates: { priority: 'high' },
              },
            },
            {
              entityType: 'requirement',
              payload: {
                action: 'update',
                id: req2.requirementId,
                updates: { priority: 'high' },
              },
            },
          ],
        })
      ).rejects.toThrow(/requirement.*not found/i);

      // Verify rollback - all requirements should remain unchanged
      const { requirement: r1 } = await requirementService.getRequirement({
        planId,
        requirementId: req1.requirementId,
      });
      const { requirement: r2 } = await requirementService.getRequirement({
        planId,
        requirementId: req2.requirementId,
      });

      expect(r1.priority).toBe('low'); // Not updated
      expect(r2.priority).toBe('medium'); // Not updated
    });

    it('Test 22: executeBatch should support mixed create and update operations', async () => {
      const existingReq = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Existing Req',
          description: 'Already exists',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'low',
          category: 'functional',
        },
      });

      const result = await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'requirement',
            payload: {
              action: 'update',
              id: existingReq.requirementId,
              updates: { priority: 'critical' },
            },
          },
          {
            entityType: 'requirement',
            payload: {
              title: 'New Req',
              description: 'Newly created',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'high',
              category: 'functional',
            },
          },
        ],
      });

      expect(result.results).toHaveLength(2);

      // Verify update
      const { requirement: updated } = await requirementService.getRequirement({
        planId,
        requirementId: existingReq.requirementId,
      });
      expect(updated.priority).toBe('critical');

      // Verify create
      const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
      expect(requirements).toHaveLength(2);
      const newReq = requirements.find((r) => r.title === 'New Req');
      expect(newReq).toBeDefined();
    });

    it('Test 23: executeBatch should update entity created in same batch (tempId)', async () => {
      const result = await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'requirement',
            payload: {
              tempId: '$0',
              title: 'New Req',
              description: 'Created in batch',
              source: { type: 'user-request' },
              acceptanceCriteria: [],
              priority: 'low',
              category: 'functional',
            },
          },
          {
            entityType: 'requirement',
            payload: {
              action: 'update',
              id: '$0',
              updates: {
                priority: 'critical',
                status: 'approved',
              },
            },
          },
        ],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);

      const createdId = result.tempIdMapping.$0;
      const { requirement } = await requirementService.getRequirement({
        planId,
        requirementId: createdId,
      });

      expect(requirement.priority).toBe('critical');
      expect(requirement.status).toBe('approved');
    });

    it('Test 24: executeBatch should increment version on update', async () => {
      const req = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Test',
          description: 'Test',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'medium',
          category: 'functional',
        },
      });

      const before = await requirementService.getRequirement({
        planId,
        requirementId: req.requirementId,
      });

      await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'requirement',
            payload: {
              action: 'update',
              id: req.requirementId,
              updates: { title: 'Updated' },
            },
          },
        ],
      });

      const after = await requirementService.getRequirement({
        planId,
        requirementId: req.requirementId,
      });

      expect(after.requirement.version).toBe(before.requirement.version + 1);
    });

    it('Test 25: executeBatch should handle solution updates', async () => {
      const reqResult = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Req',
          description: 'Test',
          source: { type: 'user-request' },
          acceptanceCriteria: [],
          priority: 'high',
          category: 'functional',
        },
      });

      const sol = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Original Solution',
          description: 'Original',
          approach: 'Approach 1',
          addressing: [reqResult.requirementId],
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 5, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk',
          },
        },
      });

      await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'solution',
            payload: {
              action: 'update',
              id: sol.solutionId,
              updates: {
                title: 'Updated Solution',
                approach: 'Approach 2',
              },
            },
          },
        ],
      });

      const { solution } = await solutionService.getSolution({
        planId,
        solutionId: sol.solutionId,
      });

      expect(solution.title).toBe('Updated Solution');
      expect(solution.approach).toBe('Approach 2');
    });
  });

  describe('BUG #14: Error message accuracy', () => {
    it('GREEN: should show "title is required" when requirement created without title', async () => {
      // BUG #14: Batch operations show correct error message
      // Verified: 'title is required' (fixed via validateRequiredString)
      await expect(
        batchService.executeBatch({
          planId,
          operations: [
            {
              entityType: 'requirement',
              payload: {
                // Missing title - should throw "title is required"
                description: 'Some description',
                source: { type: 'user-request' },
                acceptanceCriteria: [],
                priority: 'high',
                category: 'functional',
              },
            },
          ],
        })
      ).rejects.toThrow(/title is required/i);
    });

    it('GREEN: should show "title is required" when solution created without title', async () => {
      await expect(
        batchService.executeBatch({
          planId,
          operations: [
            {
              entityType: 'solution',
              payload: {
                // Missing title - should throw "title is required"
                description: 'Some description',
                approach: 'Approach',
                addressing: [],
                tradeoffs: [],
              },
            },
          ],
        })
      ).rejects.toThrow(/title is required/i);
    });

    it('GREEN: should show "title is required" when phase created without title', async () => {
      await expect(
        batchService.executeBatch({
          planId,
          operations: [
            {
              entityType: 'phase',
              payload: {
                // Missing title - should throw "title is required"
                description: 'Some description',
              },
            },
          ],
        })
      ).rejects.toThrow(/title is required/i);
    });

    it('GREEN: should show "title is required" when decision created without title', async () => {
      await expect(
        batchService.executeBatch({
          planId,
          operations: [
            {
              entityType: 'decision',
              payload: {
                // Missing title - should throw "title is required"
                question: 'Some question',
                decision: 'Some decision',
                context: 'Some context',
              },
            },
          ],
        })
      ).rejects.toThrow(/title is required/i);
    });

    it('GREEN: should show "title is required" when artifact created without title', async () => {
      const phase = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Test Phase',
          description: 'Test',
        },
      });

      await expect(
        batchService.executeBatch({
          planId,
          operations: [
            {
              entityType: 'artifact',
              payload: {
                // Missing title - should throw "title is required"
                description: 'Some description',
                artifactType: 'code',
                relatedPhaseId: phase.phaseId,
              },
            },
          ],
        })
      ).rejects.toThrow(/title is required/i);
    });
  });

  describe('BUG-001 & BUG-008: Nested payload format from MCP tool handler', () => {
    // QA Report Test Attempt #2: Batch without temp IDs fails with nested format
    it('RED: should handle nested format - phase with action and nested phase object', async () => {
      const result = await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'phase',
            payload: {
              action: 'add',
              phase: {
                title: 'Batch phase 1',
                objectives: ['test']
              }
            }
          },
          {
            entityType: 'phase',
            payload: {
              action: 'add',
              phase: {
                title: 'Batch phase 2',
                objectives: ['test']
              }
            }
          }
        ]
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].id).toBeDefined();
      expect(result.results[1].success).toBe(true);
      expect(result.results[1].id).toBeDefined();
    });

    // QA Report Test Attempt #1: Batch with temp IDs in nested format
    it('RED: should handle nested format with temp ID resolution - requirement and solution', async () => {
      const result = await batchService.executeBatch({
        planId,
        operations: [
          {
            entityType: 'requirement',
            payload: {
              action: 'add',
              requirement: {
                title: 'BUG-001: Test Requirement for Temp ID',
                description: 'Testing if $0 will be resolved in next operation',
                category: 'functional',
                priority: 'high',
                source: { type: 'user-request' },
                impact: {
                  scope: ['testing'],
                  complexityEstimate: 3,
                  riskLevel: 'low'
                }
              }
            }
          },
          {
            entityType: 'solution',
            payload: {
              action: 'propose',
              solution: {
                title: 'Solution addressing temp ID $0',
                description: 'This solution should reference the first requirement via temp ID',
                approach: 'Use temp ID resolution',
                addressing: ['$0']
              }
            }
          }
        ]
      });

      // Should succeed and resolve temp ID
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);

      // BUG-008: tempIdMapping should be populated
      expect(result.tempIdMapping).toBeDefined();
      expect(result.tempIdMapping.$0).toBe(result.results[0].id);
    });
  });
});

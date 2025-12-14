import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LinkingService } from '../../src/domain/services/linking-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { PhaseService } from '../../src/domain/services/phase-service.js';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('LinkingService', () => {
  let service: LinkingService;
  let planService: PlanService;
  let requirementService: RequirementService;
  let solutionService: SolutionService;
  let phaseService: PhaseService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  // Helper IDs for real entities (created in beforeEach)
  let sol1Id: string;
  let sol2Id: string;
  let req1Id: string;
  let req2Id: string;
  let phaseAId: string;
  let phaseBId: string;
  let phaseCId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-link-test-${Date.now().toString()}`);

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
    service = new LinkingService(repositoryFactory);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing links',
    });
    planId = plan.planId;

    // Create real entities for testing links
    const sol1 = await solutionService.proposeSolution({
      planId,
      solution: { title: 'Solution 1' },
    });
    sol1Id = sol1.solutionId;

    const sol2 = await solutionService.proposeSolution({
      planId,
      solution: { title: 'Solution 2' },
    });
    sol2Id = sol2.solutionId;

    const req1 = await requirementService.addRequirement({
      planId,
      requirement: {
        title: 'Requirement 1',
        description: 'Test',
        category: 'functional',
        priority: 'high',
        acceptanceCriteria: [],
        source: { type: 'user-request' },
      },
    });
    req1Id = req1.requirementId;

    const req2 = await requirementService.addRequirement({
      planId,
      requirement: {
        title: 'Requirement 2',
        description: 'Test',
        category: 'functional',
        priority: 'medium',
        acceptanceCriteria: [],
        source: { type: 'user-request' },
      },
    });
    req2Id = req2.requirementId;

    const phaseA = await phaseService.addPhase({
      planId,
      phase: { title: 'Phase A' },
    });
    phaseAId = phaseA.phaseId;

    const phaseB = await phaseService.addPhase({
      planId,
      phase: { title: 'Phase B' },
    });
    phaseBId = phaseB.phaseId;

    const phaseC = await phaseService.addPhase({
      planId,
      phase: { title: 'Phase C' },
    });
    phaseCId = phaseC.phaseId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('link_entities', () => {
    it('should create a link', async () => {
      const result = await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });

      expect(result.linkId).toBeDefined();

      // Verify via getEntityLinks
      const links = await service.getEntityLinks({ planId, entityId: sol1Id, direction: 'outgoing' });
      expect(links.outgoing).toHaveLength(1);
      expect(links.outgoing[0].relationType).toBe('implements');
    });

    it('should prevent duplicate links', async () => {
      await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });

      await expect(
        service.linkEntities({
          planId,
          sourceId: sol1Id,
          targetId: req1Id,
          relationType: 'implements',
        })
      ).rejects.toThrow('Link already exists');
    });

    it('should store metadata', async () => {
      const result = await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: sol2Id,
        relationType: 'alternative_to',
        metadata: { comparison: 'Both solve auth' },
      });

      expect(result.linkId).toBeDefined();

      // Verify via getEntityLinks
      const links = await service.getEntityLinks({ planId, entityId: sol1Id, direction: 'outgoing' });
      expect(links.outgoing[0].metadata?.comparison).toBe('Both solve auth');
    });

    it('should detect circular dependencies', async () => {
      await service.linkEntities({
        planId,
        sourceId: phaseAId,
        targetId: phaseBId,
        relationType: 'depends_on',
      });

      await service.linkEntities({
        planId,
        sourceId: phaseBId,
        targetId: phaseCId,
        relationType: 'depends_on',
      });

      // This would create A -> B -> C -> A cycle
      await expect(
        service.linkEntities({
          planId,
          sourceId: phaseCId,
          targetId: phaseAId,
          relationType: 'depends_on',
        })
      ).rejects.toThrow('Circular dependency');
    });

    it('should allow non-depends_on links without cycle check', async () => {
      // This is fine - alternative_to is not a dependency
      await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: sol2Id,
        relationType: 'alternative_to',
      });

      const result = await service.linkEntities({
        planId,
        sourceId: sol2Id,
        targetId: sol1Id,
        relationType: 'alternative_to',
      });

      expect(result.linkId).toBeDefined();
    });

    // BUG #13: Foreign key validation for sourceId and targetId references
    describe('sourceId/targetId validation (BUG #13 - Sprint 4)', () => {
      it('RED: should reject non-existent sourceId', async () => {
        // Create a real requirement for targetId
        const req = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Real Requirement',
            description: 'Test',
            category: 'functional',
            priority: 'high',
            acceptanceCriteria: [],
            source: { type: 'user-request' },
          },
        });

        await expect(service.linkEntities({
          planId,
          sourceId: 'non-existent-source-id',
          targetId: req.requirementId,
          relationType: 'implements',
        })).rejects.toThrow(/Entity.*non-existent-source-id.*not found/i);
      });

      it('RED: should reject non-existent targetId', async () => {
        // Create a real solution for sourceId
        const sol = await solutionService.proposeSolution({
          planId,
          solution: {
            title: 'Real Solution',
          },
        });

        await expect(service.linkEntities({
          planId,
          sourceId: sol.solutionId,
          targetId: 'non-existent-target-id',
          relationType: 'implements',
        })).rejects.toThrow(/Entity.*non-existent-target-id.*not found/i);
      });

      it('GREEN: should accept valid sourceId and targetId', async () => {
        // Create real entities
        const sol = await solutionService.proposeSolution({
          planId,
          solution: { title: 'Real Solution' },
        });

        const req = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Real Requirement',
            description: 'Test',
            category: 'functional',
            priority: 'high',
            acceptanceCriteria: [],
            source: { type: 'user-request' },
          },
        });

        // Should succeed with valid entity IDs
        const result = await service.linkEntities({
          planId,
          sourceId: sol.solutionId,
          targetId: req.requirementId,
          relationType: 'implements',
        });

        expect(result.linkId).toBeDefined();
      });

      it('GREEN: should accept depends_on link between real phases', async () => {
        // Create real phases
        const phase1 = await phaseService.addPhase({
          planId,
          phase: { title: 'Phase 1' },
        });

        const phase2 = await phaseService.addPhase({
          planId,
          phase: { title: 'Phase 2' },
        });

        // Should succeed with valid phase IDs
        const result = await service.linkEntities({
          planId,
          sourceId: phase1.phaseId,
          targetId: phase2.phaseId,
          relationType: 'depends_on',
        });

        expect(result.linkId).toBeDefined();
      });

      it('RED: should reject both non-existent sourceId and targetId', async () => {
        await expect(service.linkEntities({
          planId,
          sourceId: 'fake-source',
          targetId: 'fake-target',
          relationType: 'references',
        })).rejects.toThrow(/Entity.*not found/i);
      });
    });
  });

  describe('get_entity_links', () => {
    beforeEach(async () => {
      // Create some links (using real entity IDs from outer beforeEach)
      await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });
      await service.linkEntities({
        planId,
        sourceId: sol2Id,
        targetId: req1Id,
        relationType: 'implements',
      });
      await service.linkEntities({
        planId,
        sourceId: phaseAId,
        targetId: req1Id,
        relationType: 'addresses',
      });
    });

    it('should get all links for entity', async () => {
      const result = await service.getEntityLinks({
        planId,
        entityId: req1Id,
      });

      expect(result.links).toHaveLength(3);
      expect(result.incoming).toHaveLength(3);
      expect(result.outgoing).toHaveLength(0);
    });

    it('should filter by direction', async () => {
      const result = await service.getEntityLinks({
        planId,
        entityId: sol1Id,
        direction: 'outgoing',
      });

      expect(result.links).toHaveLength(1);
      expect(result.outgoing).toHaveLength(1);
      expect(result.incoming).toHaveLength(0);
    });

    it('should filter by relation type', async () => {
      const result = await service.getEntityLinks({
        planId,
        entityId: req1Id,
        relationType: 'implements',
      });

      expect(result.incoming).toHaveLength(2);
    });
  });

  describe('unlink_entities', () => {
    it('should delete link by id', async () => {
      const created = await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });

      const result = await service.unlinkEntities({
        planId,
        linkId: created.linkId,
      });

      expect(result.success).toBe(true);
      expect(result.deletedLinkIds).toContain(created.linkId);

      const links = await service.getEntityLinks({ planId, entityId: req1Id });
      expect(links.links).toHaveLength(0);
    });

    it('should delete by source/target/type', async () => {
      await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });

      const result = await service.unlinkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });

      expect(result.success).toBe(true);
      expect(result.deletedLinkIds).toHaveLength(1);
    });
  });

  describe('helper methods', () => {
    it('should get all links for entity', async () => {
      await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });

      const links = await service.getLinksForEntity(planId, sol1Id);
      expect(links).toHaveLength(1);
    });

    it('should delete all links for entity', async () => {
      await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req1Id,
        relationType: 'implements',
      });
      await service.linkEntities({
        planId,
        sourceId: sol1Id,
        targetId: req2Id,
        relationType: 'implements',
      });

      const deleted = await service.deleteLinksForEntity(planId, sol1Id);
      expect(deleted).toBe(2);

      const remaining = await service.getLinksForEntity(planId, sol1Id);
      expect(remaining).toHaveLength(0);
    });
  });

  describe('minimal return values (Sprint 6)', () => {
    describe('linkEntities should return only linkId', () => {
      it('should not include full link object in result', async () => {
        const result = await service.linkEntities({
          planId,
          sourceId: sol1Id,
          targetId: req1Id,
          relationType: 'implements',
        });

        expect(result.linkId).toBeDefined();
        expect(result).not.toHaveProperty('link');
      });
    });
  });

  // REQ-5: Data Integrity - Self-Reference Validation
  describe('self-reference validation (REQ-5)', () => {
    it('RED: should reject self-referencing link', async () => {
      await expect(service.linkEntities({
        planId,
        sourceId: req1Id,
        targetId: req1Id,
        relationType: 'references',
      })).rejects.toThrow('Cannot create self-referencing link');
    });

    it('RED: should reject self-referencing depends_on link', async () => {
      await expect(service.linkEntities({
        planId,
        sourceId: phaseAId,
        targetId: phaseAId,
        relationType: 'depends_on',
      })).rejects.toThrow('Cannot create self-referencing link');
    });

    it('GREEN: should allow link between different entities', async () => {
      const result = await service.linkEntities({
        planId,
        sourceId: req1Id,
        targetId: req2Id,
        relationType: 'derived_from',
      });

      expect(result.linkId).toBeDefined();
    });
  });
});

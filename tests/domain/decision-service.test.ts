import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DecisionService } from '../../src/domain/services/decision-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('DecisionService', () => {
  let service: DecisionService;
  let planService: PlanService;
  let storage: FileStorage;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-dec-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();

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

    planService = new PlanService(storage);
    service = new DecisionService(repositoryFactory, planService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing decisions',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('record_decision', () => {
    it('should record a new decision', async () => {
      const result = await service.recordDecision({
        planId,
        decision: {
          title: 'JWT Library Selection',
          question: 'Which JWT library should we use?',
          context: 'Need secure JWT handling',
          decision: 'Use jsonwebtoken',
          alternativesConsidered: [
            { option: 'jose', reasoning: 'Modern', whyNotChosen: 'Less mature' },
          ],
        },
      });

      expect(result.decisionId).toBeDefined();

      // Verify via getDecision
      const { decision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });
      expect(decision.title).toBe('JWT Library Selection');
      expect(decision.status).toBe('active');
    });

    it('should store alternatives considered', async () => {
      const result = await service.recordDecision({
        planId,
        decision: {
          title: 'Database Choice',
          question: 'Which database?',
          context: 'Need ACID',
          decision: 'PostgreSQL',
          alternativesConsidered: [
            { option: 'MySQL', reasoning: 'Popular', whyNotChosen: 'Less features' },
            { option: 'MongoDB', reasoning: 'Flexible', whyNotChosen: 'No ACID' },
          ],
        },
      });

      // Verify via getDecision
      const { decision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });
      expect(decision.alternativesConsidered).toHaveLength(2);
    });
  });

  describe('get_decision_history', () => {
    beforeEach(async () => {
      await service.recordDecision({
        planId,
        decision: {
          title: 'First Decision',
          question: 'Q1',
          context: 'C1',
          decision: 'D1',
          alternativesConsidered: [],
        },
      });
      await service.recordDecision({
        planId,
        decision: {
          title: 'Second Decision',
          question: 'Q2',
          context: 'C2',
          decision: 'D2',
          alternativesConsidered: [],
        },
      });
    });

    it('should return decision history', async () => {
      const result = await service.getDecisionHistory({ planId });
      expect(result.decisions).toHaveLength(2);
    });

    it('should search in decision text', async () => {
      const result = await service.getDecisionHistory({
        planId,
        filters: { search: 'First' },
      });
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].title).toBe('First Decision');
    });
  });

  describe('update_decision (supersede)', () => {
    it('should supersede a decision', async () => {
      const original = await service.recordDecision({
        planId,
        decision: {
          title: 'JWT Choice',
          question: 'Which JWT lib?',
          context: 'Auth',
          decision: 'jsonwebtoken',
          alternativesConsidered: [],
        },
      });

      const result = await service.updateDecision({
        planId,
        decisionId: original.decisionId,
        supersede: {
          newDecision: 'jose',
          reason: 'Performance issues found',
        },
      });

      // Verify via getDecision
      const { decision: newDecision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });
      const { decision: oldDecision } = await service.getDecision({ planId, decisionId: original.decisionId, fields: ['*'] });

      expect(newDecision.decision).toBe('jose');
      expect(newDecision.status).toBe('active');
      expect(oldDecision.status).toBe('superseded');
      expect(newDecision.supersedes).toBe(original.decisionId);
    });

    it('should add old decision to alternatives', async () => {
      const original = await service.recordDecision({
        planId,
        decision: {
          title: 'Choice',
          question: 'Q',
          context: 'C',
          decision: 'Option A',
          alternativesConsidered: [],
        },
      });

      const result = await service.updateDecision({
        planId,
        decisionId: original.decisionId,
        supersede: {
          newDecision: 'Option B',
          reason: 'Better performance',
        },
      });

      // Verify via getDecision
      const { decision: newDecision } = await service.getDecision({ planId, decisionId: result.decisionId, fields: ['*'] });

      const oldInAlternatives = newDecision.alternativesConsidered.find(
        (a) => a.option === 'Option A'
      );
      expect(oldInAlternatives).toBeDefined();
      expect(oldInAlternatives?.whyNotChosen).toBe('Better performance');
    });
  });

  describe('list_decisions', () => {
    it('should filter by status', async () => {
      const d1 = await service.recordDecision({
        planId,
        decision: {
          title: 'D1',
          question: 'Q',
          context: 'C',
          decision: 'A',
          alternativesConsidered: [],
        },
      });

      await service.updateDecision({
        planId,
        decisionId: d1.decisionId,
        supersede: { newDecision: 'B', reason: 'Test' },
      });

      const activeOnly = await service.listDecisions({
        planId,
        filters: { status: 'active' },
      });

      expect(activeOnly.decisions).toHaveLength(1);
      expect(activeOnly.decisions[0].decision).toBe('B');
    });
  });

  describe('minimal return values (Sprint 6)', () => {
    describe('recordDecision should return only decisionId', () => {
      it('should not include full decision object in result', async () => {
        const result = await service.recordDecision({
          planId,
          decision: {
            title: 'Test Decision',
            question: 'What to do?',
            context: 'Context',
            decision: 'Do X',
            alternativesConsidered: [],
          },
        });

        expect(result.decisionId).toBeDefined();
        expect(result).not.toHaveProperty('decision');
      });
    });

    describe('updateDecision should return only success and decisionId', () => {
      it('should not include full decision object in result', async () => {
        const added = await service.recordDecision({
          planId,
          decision: {
            title: 'Test',
            question: 'Q',
            context: 'C',
            decision: 'D',
            alternativesConsidered: [],
          },
        });

        const result = await service.updateDecision({
          planId,
          decisionId: added.decisionId,
          updates: { consequences: 'Updated consequences' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('decision');
      });
    });

    describe('supersedeDecision should return only success and IDs', () => {
      it('should not include full decision objects in result', async () => {
        const original = await service.recordDecision({
          planId,
          decision: {
            title: 'Original',
            question: 'Q',
            context: 'C',
            decision: 'A',
            alternativesConsidered: [],
          },
        });

        const result = await service.supersedeDecision({
          planId,
          decisionId: original.decisionId,
          newDecision: {
            decision: 'B',
            context: 'Updated context',
          },
          reason: 'Better option',
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('newDecision');
        expect(result).not.toHaveProperty('supersededDecision');
      });
    });
  });
});

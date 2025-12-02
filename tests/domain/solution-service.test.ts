import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SolutionService', () => {
  let service: SolutionService;
  let planService: PlanService;
  let storage: FileStorage;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-sol-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();
    planService = new PlanService(storage);
    service = new SolutionService(storage, planService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing solutions',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('propose_solution', () => {
    it('should add a new solution', async () => {
      const result = await service.proposeSolution({
        planId,
        solution: {
          title: 'Use jsonwebtoken',
          description: 'JWT library for auth',
          approach: 'Install and configure',
          tradeoffs: [
            { aspect: 'Security', pros: ['Battle-tested'], cons: ['Dependency'], score: 8 },
          ],
          addressing: ['req-001'],
          evaluation: {
            effortEstimate: { value: 4, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk',
          },
        },
      });

      expect(result.solutionId).toBeDefined();
      expect(result.solution.title).toBe('Use jsonwebtoken');
      expect(result.solution.status).toBe('proposed');
    });

    it('should store tradeoffs', async () => {
      const result = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution',
          description: 'Desc',
          approach: 'Approach',
          tradeoffs: [
            { aspect: 'Performance', pros: ['Fast'], cons: ['Memory'], score: 7 },
            { aspect: 'Maintainability', pros: ['Clean'], cons: ['Complex'], score: 6 },
          ],
          addressing: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'medium',
            riskAssessment: 'Medium',
          },
        },
      });

      expect(result.solution.tradeoffs).toHaveLength(2);
      expect(result.solution.tradeoffs[0].score).toBe(7);
    });
  });

  describe('compare_solutions', () => {
    let sol1Id: string;
    let sol2Id: string;
    let sol3Id: string;

    beforeEach(async () => {
      const s1 = await service.proposeSolution({
        planId,
        solution: {
          title: 'jsonwebtoken',
          description: 'JWT lib',
          approach: 'npm install',
          tradeoffs: [
            { aspect: 'Security', pros: ['Tested'], cons: ['Dep'], score: 8 },
            { aspect: 'Performance', pros: ['Fast'], cons: [], score: 9 },
          ],
          addressing: ['req-001'],
          evaluation: {
            effortEstimate: { value: 4, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });
      sol1Id = s1.solutionId;

      const s2 = await service.proposeSolution({
        planId,
        solution: {
          title: 'jose',
          description: 'Modern JWT',
          approach: 'npm install jose',
          tradeoffs: [
            { aspect: 'Security', pros: ['Modern'], cons: ['New'], score: 7 },
            { aspect: 'Performance', pros: ['Async'], cons: ['Overhead'], score: 7 },
          ],
          addressing: ['req-001'],
          evaluation: {
            effortEstimate: { value: 6, unit: 'hours', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Medium',
          },
        },
      });
      sol2Id = s2.solutionId;

      const s3 = await service.proposeSolution({
        planId,
        solution: {
          title: 'passport-jwt',
          description: 'Passport JWT',
          approach: 'npm install passport',
          tradeoffs: [
            { aspect: 'Security', pros: ['Passport ecosystem'], cons: ['Heavy'], score: 6 },
            { aspect: 'Performance', pros: [], cons: ['Slow'], score: 5 },
          ],
          addressing: ['req-001'],
          evaluation: {
            effortEstimate: { value: 8, unit: 'hours', confidence: 'low' },
            technicalFeasibility: 'medium',
            riskAssessment: 'High',
          },
        },
      });
      sol3Id = s3.solutionId;
    });

    it('should compare multiple solutions', async () => {
      const result = await service.compareSolutions({
        planId,
        solutionIds: [sol1Id, sol2Id, sol3Id],
      });

      expect(result.comparison.solutions).toHaveLength(3);
      expect(result.comparison.matrix.length).toBeGreaterThan(0);
    });

    it('should identify best solution', async () => {
      const result = await service.compareSolutions({
        planId,
        solutionIds: [sol1Id, sol2Id, sol3Id],
      });

      expect(result.comparison.summary.bestOverall).toBe(sol1Id);
    });

    it('should filter by aspects', async () => {
      const result = await service.compareSolutions({
        planId,
        solutionIds: [sol1Id, sol2Id],
        aspects: ['Security'],
      });

      expect(result.comparison.matrix).toHaveLength(1);
      expect(result.comparison.matrix[0].aspect).toBe('Security');
    });
  });

  describe('select_solution', () => {
    it('should mark solution as selected', async () => {
      const proposed = await service.proposeSolution({
        planId,
        solution: {
          title: 'Selected Solution',
          description: 'Will be selected',
          approach: 'Approach',
          tradeoffs: [],
          addressing: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      const result = await service.selectSolution({
        planId,
        solutionId: proposed.solutionId,
        reason: 'Best fit',
      });

      expect(result.solution.status).toBe('selected');
      expect(result.solution.selectionReason).toBe('Best fit');
    });

    it('should deselect other solutions for same requirement', async () => {
      const s1 = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution 1',
          description: 'First',
          approach: 'A',
          tradeoffs: [],
          addressing: ['req-001'],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      const s2 = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution 2',
          description: 'Second',
          approach: 'B',
          tradeoffs: [],
          addressing: ['req-001'],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      // Select first
      await service.selectSolution({ planId, solutionId: s1.solutionId });

      // Select second
      const result = await service.selectSolution({ planId, solutionId: s2.solutionId });

      expect(result.solution.status).toBe('selected');
      expect(result.deselected).toHaveLength(1);
      expect(result.deselected![0].id).toBe(s1.solutionId);
    });
  });

  describe('list_solutions', () => {
    it('should list all solutions', async () => {
      await service.proposeSolution({
        planId,
        solution: {
          title: 'Sol 1',
          description: 'D1',
          approach: 'A',
          tradeoffs: [],
          addressing: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });
      await service.proposeSolution({
        planId,
        solution: {
          title: 'Sol 2',
          description: 'D2',
          approach: 'B',
          tradeoffs: [],
          addressing: [],
          evaluation: {
            effortEstimate: { value: 2, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      const result = await service.listSolutions({ planId });
      expect(result.solutions).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const sol = await service.proposeSolution({
        planId,
        solution: {
          title: 'To Select',
          description: 'D',
          approach: 'A',
          tradeoffs: [],
          addressing: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      await service.selectSolution({ planId, solutionId: sol.solutionId });

      const result = await service.listSolutions({
        planId,
        filters: { status: 'selected' },
      });

      expect(result.solutions).toHaveLength(1);
    });
  });

  describe('delete_solution', () => {
    it('should delete solution', async () => {
      const sol = await service.proposeSolution({
        planId,
        solution: {
          title: 'To Delete',
          description: 'D',
          approach: 'A',
          tradeoffs: [],
          addressing: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      const result = await service.deleteSolution({
        planId,
        solutionId: sol.solutionId,
      });

      expect(result.success).toBe(true);

      const list = await service.listSolutions({ planId });
      expect(list.solutions).toHaveLength(0);
    });
  });
});

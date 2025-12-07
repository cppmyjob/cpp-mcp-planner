import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SolutionService', () => {
  let service: SolutionService;
  let requirementService: RequirementService;
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
    requirementService = new RequirementService(storage, planService);

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

      // Verify via getSolution
      const { solution } = await service.getSolution({ planId, solutionId: result.solutionId, fields: ['*'] });
      expect(solution.title).toBe('Use jsonwebtoken');
      expect(solution.status).toBe('proposed');
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

      // Verify via getSolution
      const { solution } = await service.getSolution({ planId, solutionId: result.solutionId, fields: ['*'] });
      expect(solution.tradeoffs).toHaveLength(2);
      expect(solution.tradeoffs[0].score).toBe(7);
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

    it('should throw error when solutionIds is undefined', async () => {
      await expect(
        service.compareSolutions({
          planId,
          solutionIds: undefined as any,
        })
      ).rejects.toThrow('solutionIds must be a non-empty array');
    });

    it('should throw error when solutionIds is empty array', async () => {
      await expect(
        service.compareSolutions({
          planId,
          solutionIds: [],
        })
      ).rejects.toThrow('solutionIds must be a non-empty array');
    });

    it('should throw error when solutionIds is not an array', async () => {
      await expect(
        service.compareSolutions({
          planId,
          solutionIds: 'not-an-array' as any,
        })
      ).rejects.toThrow('solutionIds must be a non-empty array');
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

      // Verify via getSolution
      const { solution } = await service.getSolution({ planId, solutionId: proposed.solutionId, fields: ['*'] });
      expect(solution.status).toBe('selected');
      expect(solution.selectionReason).toBe('Best fit');
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

      // Verify via getSolution
      const { solution } = await service.getSolution({ planId, solutionId: s2.solutionId, fields: ['*'] });
      expect(solution.status).toBe('selected');
      expect(result.deselectedIds).toHaveLength(1);
      expect(result.deselectedIds![0]).toBe(s1.solutionId);
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

  describe('minimal return values (Sprint 6)', () => {
    describe('proposeSolution should return only solutionId', () => {
      it('should not include full solution object in result', async () => {
        const result = await service.proposeSolution({
          planId,
          solution: {
            title: 'Test Solution',
            description: 'Test',
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

        expect(result.solutionId).toBeDefined();
        expect(result).not.toHaveProperty('solution');
      });
    });

    describe('updateSolution should return only success and solutionId', () => {
      it('should not include full solution object in result', async () => {
        const added = await service.proposeSolution({
          planId,
          solution: {
            title: 'Test',
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

        const result = await service.updateSolution({
          planId,
          solutionId: added.solutionId,
          updates: { title: 'Updated' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('solution');
      });
    });

    describe('selectSolution should return only success and IDs', () => {
      it('should not include full solution objects in result', async () => {
        const sol = await service.proposeSolution({
          planId,
          solution: {
            title: 'Test',
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

        const result = await service.selectSolution({
          planId,
          solutionId: sol.solutionId,
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('solution');
        expect(result).not.toHaveProperty('deselected');
      });
    });
  });

  describe('fields parameter support', () => {
    let reqId: string;
    let solId: string;

    beforeEach(async () => {
      reqId = 'req-123';
      const result = await service.proposeSolution({
        planId,
        solution: {
          title: 'Complete Solution',
          description: 'Full description',
          approach: 'Detailed approach',
          implementationNotes: 'Important implementation notes',
          addressing: [reqId],
          tradeoffs: [
            { aspect: 'performance', pros: ['fast'], cons: ['memory'], score: 8 },
          ],
          evaluation: {
            effortEstimate: { value: 5, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Medium risk',
          },
        },
      });
      solId = result.solutionId;
    });

    describe('getSolution with fields', () => {
      it('should return only minimal fields when fields=["id","title"]', async () => {
        const result = await service.getSolution({
          planId,
          solutionId: solId,
          fields: ['id', 'title'],
        });

        const sol = result.solution as unknown as Record<string, unknown>;
        expect(sol.id).toBe(solId);
        expect(sol.title).toBe('Complete Solution');
        expect(sol.description).toBeUndefined();
        expect(sol.tradeoffs).toBeUndefined();
      });

      it('should return ALL fields by default (no fields parameter)', async () => {
        const result = await service.getSolution({
          planId,
          solutionId: solId,
        });

        const sol = result.solution;
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        expect(sol.description).toBeDefined();
        expect(sol.status).toBeDefined();

        // GET operations should return all fields by default
        expect(sol.tradeoffs).toBeDefined();
        expect(sol.implementationNotes).toBe('Important implementation notes');
        expect(sol.evaluation).toBeDefined();
      });

      it('should return all fields when fields=["*"]', async () => {
        const result = await service.getSolution({
          planId,
          solutionId: solId,
          fields: ['*'],
        });

        const sol = result.solution;
        expect(sol.tradeoffs).toBeDefined();
        expect(sol.implementationNotes).toBe('Important implementation notes');
        expect(sol.evaluation).toBeDefined();
      });
    });

    describe('listSolutions with fields', () => {
      it('should return summary fields by default', async () => {
        const result = await service.listSolutions({
          planId,
        });

        expect(result.solutions.length).toBeGreaterThan(0);
        const sol = result.solutions[0];
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        expect(sol.tradeoffs).toBeUndefined();
      });

      it('should return minimal fields when fields=["id","title","status"]', async () => {
        const result = await service.listSolutions({
          planId,
          fields: ['id', 'title', 'status'],
        });

        const sol = result.solutions[0] as unknown as Record<string, unknown>;
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        expect(sol.status).toBeDefined();
        expect(sol.description).toBeUndefined();
      });
    });
  });

  describe('bulk_update (Sprint 9 - RED Phase)', () => {
    let reqId: string;
    let sol1Id: string;
    let sol2Id: string;
    let sol3Id: string;

    beforeEach(async () => {
      // Create a requirement first
      const req = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'For testing',
          category: 'functional',
          priority: 'high',
          acceptanceCriteria: [],
          source: { type: 'user-request' },
        },
      });
      reqId = req.requirementId;

      // Create test solutions
      const s1 = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution 1',
          description: 'First solution',
          approach: 'Approach 1',
          addressing: [reqId],
          tradeoffs: [],
          evaluation: {
            technicalFeasibility: 'high',
            effortEstimate: { value: 1, unit: 'days', confidence: 'medium' },
            riskAssessment: 'Low risk',
          },
        },
      });
      sol1Id = s1.solutionId;

      const s2 = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution 2',
          description: 'Second solution',
          approach: 'Approach 2',
          addressing: [reqId],
          tradeoffs: [],
          evaluation: {
            technicalFeasibility: 'medium',
            effortEstimate: { value: 2, unit: 'days', confidence: 'medium' },
            riskAssessment: 'Medium risk',
          },
        },
      });
      sol2Id = s2.solutionId;

      const s3 = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution 3',
          description: 'Third solution',
          approach: 'Approach 3',
          addressing: [reqId],
          tradeoffs: [],
          evaluation: {
            technicalFeasibility: 'low',
            effortEstimate: { value: 3, unit: 'days', confidence: 'low' },
            riskAssessment: 'High risk',
          },
        },
      });
      sol3Id = s3.solutionId;
    });

    it('RED 9.9: should update multiple solutions in one call', async () => {
      const result = await service.bulkUpdateSolutions({
        planId,
        updates: [
          { solutionId: sol1Id, updates: { approach: 'Updated Approach 1' } },
          { solutionId: sol2Id, updates: { title: 'Updated Solution 2' } },
          { solutionId: sol3Id, updates: { description: 'Updated description' } },
        ],
      });

      expect(result.updated).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);

      const updated1 = await service.getSolution({ planId, solutionId: sol1Id });
      expect(updated1.solution.approach).toBe('Updated Approach 1');

      const updated2 = await service.getSolution({ planId, solutionId: sol2Id });
      expect(updated2.solution.title).toBe('Updated Solution 2');

      const updated3 = await service.getSolution({ planId, solutionId: sol3Id });
      expect(updated3.solution.description).toBe('Updated description');
    });

    it('RED 9.10: should return individual results with success/error', async () => {
      const result = await service.bulkUpdateSolutions({
        planId,
        updates: [
          { solutionId: sol1Id, updates: { title: 'Valid Update' } },
          { solutionId: 'non-existent-id', updates: { title: 'Invalid' } },
          { solutionId: sol3Id, updates: { approach: 'New Approach' } },
        ],
        atomic: false,
      });

      expect(result.updated).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(3);

      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBeDefined();
      expect(result.results[2].success).toBe(true);
    });

    it('RED 9.11: should support atomic transaction mode', async () => {
      await expect(
        service.bulkUpdateSolutions({
          planId,
          updates: [
            { solutionId: sol1Id, updates: { title: 'Updated' } },
            { solutionId: 'invalid-id', updates: { title: 'Fail' } },
          ],
          atomic: true,
        })
      ).rejects.toThrow();

      // Verify rollback - no changes applied
      const check = await service.getSolution({ planId, solutionId: sol1Id });
      expect(check.solution.title).toBe('Solution 1'); // unchanged
    });
  });
});

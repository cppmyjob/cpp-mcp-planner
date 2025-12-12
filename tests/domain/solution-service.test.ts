import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { DecisionService } from '../../src/domain/services/decision-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RepositoryFactory } from '../../src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../src/infrastructure/repositories/file/file-lock-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SolutionService', () => {
  let service: SolutionService;
  let requirementService: RequirementService;
  let decisionService: DecisionService;
  let planService: PlanService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-sol-test-${Date.now()}`);

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
    decisionService = new DecisionService(repositoryFactory, planService);
    service = new SolutionService(repositoryFactory, planService, undefined, decisionService);
    requirementService = new RequirementService(repositoryFactory, planService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing solutions',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
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

      const _result = await service.selectSolution({
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

  // TDD Sprint: Solution-to-Decision Auto-Creation
  describe('select_solution with createDecisionRecord', () => {
    it('should automatically create Decision when createDecisionRecord=true', async () => {
      const proposed = await service.proposeSolution({
        planId,
        solution: {
          title: 'Use JWT Authentication',
          description: 'Implement JWT-based authentication',
          approach: 'Use jsonwebtoken library with secure token generation',
          tradeoffs: [
            { aspect: 'Security', pros: ['Stateless', 'Scalable'], cons: ['Token management'], score: 8 },
          ],
          addressing: ['req-auth-001'],
          evaluation: {
            effortEstimate: { value: 8, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk - well established pattern',
          },
        },
      });

      const result = await service.selectSolution({
        planId,
        solutionId: proposed.solutionId,
        reason: 'Best security and scalability',
        createDecisionRecord: true,
      });

      expect(result.success).toBe(true);
      expect(result.decisionId).toBeDefined();

      // Verify Decision was created
      const decisions = await decisionService.listDecisions({ planId });
      expect(decisions.total).toBe(1);
      expect(decisions.decisions[0].title).toContain('JWT Authentication');
    });

    it('should NOT create Decision when createDecisionRecord=false', async () => {
      const proposed = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution A',
          description: 'Description A',
          approach: 'Approach A',
          tradeoffs: [],
          addressing: ['req-001'],
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
        createDecisionRecord: false,
      });

      expect(result.success).toBe(true);
      expect(result.decisionId).toBeUndefined();

      // Verify no Decision was created
      const decisions = await decisionService.listDecisions({ planId });
      expect(decisions.total).toBe(0);
    });

    it('should NOT create Decision when createDecisionRecord is undefined (backward compatibility)', async () => {
      const proposed = await service.proposeSolution({
        planId,
        solution: {
          title: 'Solution B',
          description: 'Description B',
          approach: 'Approach B',
          tradeoffs: [],
          addressing: ['req-002'],
          evaluation: {
            effortEstimate: { value: 2, unit: 'hours', confidence: 'medium' },
            technicalFeasibility: 'medium',
            riskAssessment: 'Medium',
          },
        },
      });

      const result = await service.selectSolution({
        planId,
        solutionId: proposed.solutionId,
        reason: 'Good choice',
      });

      expect(result.success).toBe(true);
      expect(result.decisionId).toBeUndefined();

      // Verify no Decision was created
      const decisions = await decisionService.listDecisions({ planId });
      expect(decisions.total).toBe(0);
    });

    it('should populate Decision with correct data from Solution', async () => {
      const proposed = await service.proposeSolution({
        planId,
        solution: {
          title: 'GraphQL API',
          description: 'Modern API with GraphQL',
          approach: 'Use Apollo Server with TypeScript',
          implementationNotes: 'Setup resolvers and schema',
          tradeoffs: [
            { aspect: 'Flexibility', pros: ['Query what you need'], cons: ['Learning curve'], score: 9 },
            { aspect: 'Performance', pros: ['Efficient'], cons: ['Complexity'], score: 7 },
          ],
          addressing: ['req-api-001', 'req-api-002'],
          evaluation: {
            effortEstimate: { value: 3, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Medium risk - team learning required',
          },
        },
      });

      const result = await service.selectSolution({
        planId,
        solutionId: proposed.solutionId,
        reason: 'Future-proof and flexible',
        createDecisionRecord: true,
      });

      const { decision } = await decisionService.getDecision({
        planId,
        decisionId: result.decisionId!,
        fields: ['*'],
      });

      // Verify Decision fields
      expect(decision.title).toContain('GraphQL API');
      expect(decision.question).toContain('solution');
      expect(decision.context).toContain('Modern API with GraphQL');
      expect(decision.context).toContain('Apollo Server');
      expect(decision.decision).toContain('GraphQL API');
      expect(decision.consequences).toContain('risk');
      expect(decision.impactScope).toContain('req-api-001');
      expect(decision.impactScope).toContain('req-api-002');
      expect(decision.status).toBe('active');
    });

    it('should include deselected solutions in alternativesConsidered', async () => {
      // Create three solutions for the same requirement
      const _sol1 = await service.proposeSolution({
        planId,
        solution: {
          title: 'REST API',
          description: 'Traditional REST',
          approach: 'Express.js REST endpoints',
          tradeoffs: [
            { aspect: 'Simplicity', pros: ['Well known'], cons: ['Over-fetching'], score: 6 },
          ],
          addressing: ['req-api-001'],
          evaluation: {
            effortEstimate: { value: 2, unit: 'days', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      const sol2 = await service.proposeSolution({
        planId,
        solution: {
          title: 'GraphQL',
          description: 'Modern GraphQL',
          approach: 'Apollo Server',
          tradeoffs: [
            { aspect: 'Flexibility', pros: ['Efficient'], cons: ['Complex'], score: 9 },
          ],
          addressing: ['req-api-001'],
          evaluation: {
            effortEstimate: { value: 3, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Medium',
          },
        },
      });

      const _sol3 = await service.proposeSolution({
        planId,
        solution: {
          title: 'gRPC',
          description: 'High performance gRPC',
          approach: 'Protocol Buffers',
          tradeoffs: [
            { aspect: 'Performance', pros: ['Very fast'], cons: ['Steep learning'], score: 7 },
          ],
          addressing: ['req-api-001'],
          evaluation: {
            effortEstimate: { value: 5, unit: 'days', confidence: 'low' },
            technicalFeasibility: 'medium',
            riskAssessment: 'High',
          },
        },
      });

      // Select GraphQL - should deselect REST and gRPC
      const result = await service.selectSolution({
        planId,
        solutionId: sol2.solutionId,
        reason: 'Best balance of flexibility and feasibility',
        createDecisionRecord: true,
      });

      const { decision } = await decisionService.getDecision({
        planId,
        decisionId: result.decisionId!,
        fields: ['*'],
      });

      // Verify alternativesConsidered contains deselected solutions
      expect(decision.alternativesConsidered).toBeDefined();
      expect(decision.alternativesConsidered.length).toBeGreaterThanOrEqual(2);

      const alternativeTitles = decision.alternativesConsidered.map((alt: any) => alt.option);
      expect(alternativeTitles).toContain('REST API');
      expect(alternativeTitles).toContain('gRPC');
    });

    it('should handle selection with no alternatives', async () => {
      const proposed = await service.proposeSolution({
        planId,
        solution: {
          title: 'Only Solution',
          description: 'The only option',
          approach: 'Do it this way',
          tradeoffs: [],
          addressing: ['req-unique-001'],
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
        createDecisionRecord: true,
      });

      const { decision } = await decisionService.getDecision({
        planId,
        decisionId: result.decisionId!,
        fields: ['*'],
      });

      // alternativesConsidered can be empty or minimal
      expect(decision.alternativesConsidered).toBeDefined();
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

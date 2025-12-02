import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QueryService } from '../../src/domain/services/query-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { PhaseService } from '../../src/domain/services/phase-service.js';
import { LinkingService } from '../../src/domain/services/linking-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('QueryService', () => {
  let queryService: QueryService;
  let planService: PlanService;
  let requirementService: RequirementService;
  let solutionService: SolutionService;
  let phaseService: PhaseService;
  let linkingService: LinkingService;
  let storage: FileStorage;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-query-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();
    planService = new PlanService(storage);
    requirementService = new RequirementService(storage, planService);
    solutionService = new SolutionService(storage, planService);
    phaseService = new PhaseService(storage, planService);
    linkingService = new LinkingService(storage);
    queryService = new QueryService(storage, planService, linkingService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing queries',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('search_entities', () => {
    beforeEach(async () => {
      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'User Authentication',
          description: 'Users must be able to log in securely',
          source: { type: 'user-request' },
          priority: 'critical',
          category: 'functional',
          acceptanceCriteria: ['Login works', 'Session management'],
        },
      });

      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Data Export',
          description: 'Export data to CSV format',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: ['CSV download works'],
        },
      });

      await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'OAuth Integration',
          description: 'Use OAuth 2.0 for authentication',
          approach: 'Integrate with OAuth providers',
          addressing: [],
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 2, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk',
          },
        },
      });
    });

    it('should search entities by query', async () => {
      const result = await queryService.searchEntities({
        planId,
        query: 'authentication',
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.some((r) => r.entity.type === 'requirement')).toBe(true);
    });

    it('should filter by entity type', async () => {
      const result = await queryService.searchEntities({
        planId,
        query: 'authentication',
        entityTypes: ['solution'],
      });

      expect(result.results.every((r) => r.entityType === 'solution')).toBe(true);
    });

    it('should paginate results', async () => {
      const result = await queryService.searchEntities({
        planId,
        query: 'a', // Broad query to match many
        limit: 1,
        offset: 0,
      });

      expect(result.results).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it('should return relevance scores', async () => {
      const result = await queryService.searchEntities({
        planId,
        query: 'authentication',
      });

      for (const r of result.results) {
        expect(r.relevanceScore).toBeGreaterThan(0);
        expect(r.matchedFields.length).toBeGreaterThan(0);
      }
    });

    it('should return empty results for no matches', async () => {
      const result = await queryService.searchEntities({
        planId,
        query: 'nonexistent_xyz_12345',
      });

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('trace_requirement', () => {
    let reqId: string;
    let solId: string;
    let phaseId: string;

    beforeEach(async () => {
      const req = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'User Auth',
          description: 'Authentication requirement',
          source: { type: 'user-request' },
          priority: 'critical',
          category: 'functional',
          acceptanceCriteria: ['Login works'],
        },
      });
      reqId = req.requirementId;

      const sol = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'OAuth Solution',
          description: 'OAuth implementation',
          approach: 'Use OAuth',
          addressing: [reqId],
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 4, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk',
          },
        },
      });
      solId = sol.solutionId;

      // Create link
      await linkingService.linkEntities({
        planId,
        sourceId: solId,
        targetId: reqId,
        relationType: 'implements',
      });

      const phase = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Auth Phase',
          description: 'Implement auth',
          objectives: ['Build auth'],
          deliverables: ['Auth system'],
          successCriteria: ['Tests pass'],
        },
      });
      phaseId = phase.phaseId;

      // Link phase to requirement
      await linkingService.linkEntities({
        planId,
        sourceId: phaseId,
        targetId: reqId,
        relationType: 'addresses',
      });
    });

    it('should trace requirement to solutions', async () => {
      const result = await queryService.traceRequirement({
        planId,
        requirementId: reqId,
      });

      expect(result.requirement.id).toBe(reqId);
      expect(result.trace.proposedSolutions).toHaveLength(1);
      expect(result.trace.proposedSolutions[0].id).toBe(solId);
    });

    it('should trace requirement to phases', async () => {
      const result = await queryService.traceRequirement({
        planId,
        requirementId: reqId,
      });

      expect(result.trace.implementingPhases).toHaveLength(1);
      expect(result.trace.implementingPhases[0].id).toBe(phaseId);
    });

    it('should calculate completion status', async () => {
      const result = await queryService.traceRequirement({
        planId,
        requirementId: reqId,
      });

      expect(result.trace.completionStatus.isAddressed).toBe(true);
      expect(result.trace.completionStatus.isImplemented).toBe(false);
      expect(result.trace.completionStatus.completionPercentage).toBe(0);
    });

    it('should throw for non-existent requirement', async () => {
      await expect(
        queryService.traceRequirement({
          planId,
          requirementId: 'non-existent-id',
        })
      ).rejects.toThrow('Requirement not found');
    });
  });

  describe('validate_plan', () => {
    it('should detect uncovered requirements', async () => {
      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Uncovered Req',
          description: 'No solution addresses this',
          source: { type: 'user-request' },
          priority: 'critical',
          category: 'functional',
          acceptanceCriteria: [],
        },
      });

      const result = await queryService.validatePlan({ planId });

      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.type === 'uncovered_requirement')).toBe(true);
    });

    it('should detect orphan solutions', async () => {
      await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Orphan Solution',
          description: 'Not linked to anything',
          approach: 'Unknown',
          addressing: [],
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'low' },
            technicalFeasibility: 'medium',
            riskAssessment: 'Unknown',
          },
        },
      });

      const result = await queryService.validatePlan({ planId });

      expect(result.issues.some((i) => i.type === 'orphan_solution')).toBe(true);
    });

    it('should return valid for clean plan', async () => {
      // Empty plan is valid
      const result = await queryService.validatePlan({ planId });

      expect(result.isValid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });

    it('should track performed checks', async () => {
      const result = await queryService.validatePlan({ planId });

      expect(result.checksPerformed).toContain('uncovered_requirements');
      expect(result.checksPerformed).toContain('orphan_solutions');
      expect(result.checksPerformed).toContain('missing_decisions');
      expect(result.checksPerformed).toContain('broken_links');
    });
  });

  describe('export_plan', () => {
    beforeEach(async () => {
      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'For export testing',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: ['Works correctly'],
        },
      });

      await phaseService.addPhase({
        planId,
        phase: {
          title: 'Phase 1',
          description: 'First phase',
          objectives: ['Build something'],
          deliverables: ['Working code'],
          successCriteria: ['Tests pass'],
        },
      });
    });

    it('should export to JSON format', async () => {
      const result = await queryService.exportPlan({
        planId,
        format: 'json',
      });

      expect(result.format).toBe('json');
      expect(result.sizeBytes).toBeGreaterThan(0);

      const parsed = JSON.parse(result.content);
      expect(parsed.manifest).toBeDefined();
      expect(parsed.entities).toBeDefined();
    });

    it('should export to markdown format', async () => {
      const result = await queryService.exportPlan({
        planId,
        format: 'markdown',
      });

      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Test Plan');
      expect(result.content).toContain('## Requirements');
      expect(result.content).toContain('Test Requirement');
    });

    it('should save export file', async () => {
      const result = await queryService.exportPlan({
        planId,
        format: 'markdown',
      });

      expect(result.filePath).toBeDefined();
      // File should exist
      const content = await fs.readFile(result.filePath!, 'utf-8');
      expect(content).toBe(result.content);
    });

    it('should include phases in markdown', async () => {
      const result = await queryService.exportPlan({
        planId,
        format: 'markdown',
      });

      expect(result.content).toContain('## Phases');
      expect(result.content).toContain('Phase 1');
    });

    it('should handle solutions without tradeoffs field (undefined)', async () => {
      // Simulate solution created without tradeoffs field (as happens via MCP tool)
      const solutions = await storage.loadEntities(planId, 'solutions');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      solutions.push({
        id: 'solution-without-tradeoffs',
        type: 'solution',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        metadata: {
          createdBy: 'test',
          tags: [],
          annotations: [],
        },
        title: 'Solution Without Tradeoffs',
        description: 'This solution has no tradeoffs field',
        approach: 'Some approach',
        addressing: [],
        evaluation: {
          effortEstimate: { value: 1, unit: 'hours', confidence: 'high' },
          technicalFeasibility: 'high',
          riskAssessment: 'Low',
        },
        status: 'proposed',
        // NOTE: tradeoffs field is intentionally missing (undefined)
      } as any);
      await storage.saveEntities(planId, 'solutions', solutions);

      // This should NOT throw "Cannot read properties of undefined (reading 'length')"
      const result = await queryService.exportPlan({
        planId,
        format: 'markdown',
      });

      expect(result.format).toBe('markdown');
      expect(result.content).toContain('## Solutions');
      expect(result.content).toContain('Solution Without Tradeoffs');
    });
  });
});

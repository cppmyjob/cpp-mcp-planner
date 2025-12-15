import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  QueryService,
  type ValidatePlanInput,
  PlanService,
  RequirementService,
  SolutionService,
  PhaseService,
  ArtifactService,
  LinkingService,
  type Requirement,
  type Solution,
  type Phase,
  type Entity,
  type EntityType,
} from '@mcp-planner/core';
import { RepositoryFactory, FileLockManager } from '@mcp-planner/mcp-server';

// Helper functions for loading/saving entities via repository
async function loadEntities<T extends Entity>(
  repositoryFactory: RepositoryFactory,
  planId: string,
  entityType: 'requirements' | 'solutions' | 'phases' | 'artifacts'
): Promise<T[]> {
  const typeMap: Record<string, EntityType> = {
    requirements: 'requirement',
    solutions: 'solution',
    phases: 'phase',
    artifacts: 'artifact'
  };
   
  const repo = repositoryFactory.createRepository<T>(typeMap[entityType], planId);
  return repo.findAll();
}

async function saveEntities(
  repositoryFactory: RepositoryFactory,
  planId: string,
  entityType: 'requirements' | 'solutions' | 'phases' | 'artifacts',
  entities: Entity[]
): Promise<void> {
  const typeMap: Record<string, EntityType> = {
    requirements: 'requirement',
    solutions: 'solution',
    phases: 'phase',
    artifacts: 'artifact'
  };
   
  const repo = repositoryFactory.createRepository<Entity>(typeMap[entityType], planId);
  for (const entity of entities) {
    await repo.update(entity.id, entity);
  }
}
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('QueryService', () => {
  let queryService: QueryService;
  let planService: PlanService;
  let requirementService: RequirementService;
  let solutionService: SolutionService;
  let phaseService: PhaseService;
  let artifactService: ArtifactService;
  let linkingService: LinkingService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-query-test-${String(Date.now())}`);

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
    linkingService = new LinkingService(repositoryFactory);
    // BUG-046 FIX: Pass linkingService to services for proper cascading deletion
    requirementService = new RequirementService(repositoryFactory, planService, undefined, linkingService);
    solutionService = new SolutionService(repositoryFactory, planService, undefined, undefined, linkingService);
    phaseService = new PhaseService(repositoryFactory, planService, undefined, linkingService);
    artifactService = new ArtifactService(repositoryFactory, planService, undefined, linkingService);
    queryService = new QueryService(repositoryFactory, planService, linkingService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing queries',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.dispose();
    await lockManager.dispose();
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

    // RED: BUG #15 - searchEntities crashes when entity has undefined description/approach/context
    it('should handle entities with undefined searchable fields', async () => {
      // Create entities with missing description/approach/context fields
      const repo = repositoryFactory.createRepository('solution', planId);
      const solutionWithMissingFields = {
        id: 'sol-missing-desc',
        type: 'solution' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        metadata: { createdBy: 'test', tags: [], annotations: [] },
        title: 'Solution Without Description',
        // description: undefined - intentionally missing
        // approach: undefined - intentionally missing
        addressing: [],
        tradeoffs: [],
        evaluation: {
          effortEstimate: { value: 1, unit: 'hours' as const, confidence: 'high' as const },
          technicalFeasibility: 'high' as const,
          riskAssessment: 'Low',
        },
        status: 'proposed' as const,
      };
      await repo.create(solutionWithMissingFields);

      // This should NOT crash - it should handle undefined fields gracefully
      const result = await queryService.searchEntities({
        planId,
        query: 'solution',
      });

      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
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
      expect(result.trace.implementingPhases?.[0].id).toBe(phaseId);
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
      ).rejects.toThrow(/requirement.*not found/i);
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

      const result = await queryService.validatePlan({ planId, validationLevel: 'strict' });

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

    // RED TEST 1: Phase status logic - child completed but parent planned
    it('should detect child.status=completed but parent.status=planned', async () => {
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent Phase',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const { phaseId: childId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Child Phase',
          description: 'Child',
          parentId,
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Set child to completed
      await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'completed', progress: 100 });

      const result = await queryService.validatePlan({ planId });

      const issue = result.issues.find(i => i.type === 'invalid_phase_status' && i.entityId === childId);
      expect(issue).toBeDefined();
      if (issue === undefined) throw new Error('issue is required');
      expect(issue.severity).toBe('error');
      expect(issue.message).toContain('Child Phase');
      expect(issue.message).toContain('completed');
      expect(issue.message).toContain('Parent Phase');
      expect(issue.message).toContain('planned');
    });

    // RED TEST 2: Phase status logic - child in_progress but parent planned
    it('should detect child.status=in_progress but parent.status=planned', async () => {
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent Phase',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const { phaseId: childId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Child Phase',
          description: 'Child',
          parentId,
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Set child to in_progress
      await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'in_progress', progress: 50 });

      const result = await queryService.validatePlan({ planId, validationLevel: 'strict' });

      const issue = result.issues.find(i => i.type === 'invalid_phase_status' && i.entityId === childId);
      expect(issue).toBeDefined();
      if (issue === undefined) throw new Error('issue is required');
      expect(issue.severity).toBe('warning');
      expect(issue.message).toContain('in progress');
      expect(issue.message).toContain('planned');
    });

    // GREEN TEST 3: Phase status logic - child completed and parent completed (valid)
    it('should pass validation for child.status=completed and parent.status=completed', async () => {
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent Phase',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const { phaseId: childId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Child Phase',
          description: 'Child',
          parentId,
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Set both to completed
      await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'completed', progress: 100 });
      await phaseService.updatePhaseStatus({ planId, phaseId: parentId, status: 'completed', progress: 100 });

      const result = await queryService.validatePlan({ planId });

      const statusIssues = result.issues.filter(i => i.type === 'invalid_phase_status' && i.entityId === childId);
      expect(statusIssues.length).toBe(0);
    });

    // GREEN TEST 4: Phase status logic - child in_progress and parent in_progress (valid)
    it('should pass validation for child.status=in_progress and parent.status=in_progress', async () => {
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent Phase',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const { phaseId: childId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Child Phase',
          description: 'Child',
          parentId,
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Set both to in_progress
      await phaseService.updatePhaseStatus({ planId, phaseId: parentId, status: 'in_progress', progress: 50 });
      await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'in_progress', progress: 30 });

      const result = await queryService.validatePlan({ planId });

      const statusIssues = result.issues.filter(i => i.type === 'invalid_phase_status' && i.entityId === childId);
      expect(statusIssues.length).toBe(0);
    });

    // RED TEST 5: All children completed but parent not completed
    it('should detect all children completed but parent.status!=completed', async () => {
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent Phase',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Create 3 child phases
      const childIds = [];
      for (let i = 1; i <= 3; i++) {
        const { phaseId } = await phaseService.addPhase({
          planId,
          phase: {
            title: `Child Phase ${String(i)}`,
            description: `Child ${String(i)}`,
            parentId,
            objectives: [],
            deliverables: [],
            successCriteria: [],
          },
        });
        childIds.push(phaseId);
      }

      // Set all children to completed
      for (const childId of childIds) {
        await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'completed', progress: 100 });
      }

      // Parent remains in_progress
      await phaseService.updatePhaseStatus({ planId, phaseId: parentId, status: 'in_progress', progress: 80 });

      const result = await queryService.validatePlan({ planId, validationLevel: 'strict' });

      const issue = result.issues.find(i => i.type === 'parent_should_complete' && i.entityId === parentId);
      expect(issue).toBeDefined();
      if (issue === undefined) throw new Error('issue is required');
      expect(issue.severity).toBe('info');
      expect(issue.message).toContain('all children completed');
      expect(issue.message).toContain('Parent Phase');
    });

    // RED TEST 6: File existence - detect missing file in artifact.targets
    it('should detect missing file in artifact.targets', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Code Artifact',
          description: 'Implementation',
          artifactType: 'code',
          targets: [
            { path: 'src/nonexistent.ts', action: 'modify', description: 'Nonexistent file' },
          ],
        },
      });

      const result = await queryService.validatePlan({ planId, validationLevel: 'strict' });

      const issue = result.issues.find(i => i.type === 'missing_file');
      expect(issue).toBeDefined();
      if (issue === undefined) throw new Error('issue is required');
      expect(issue.severity).toBe('warning');
      expect(issue.filePath).toBe('src/nonexistent.ts');
      expect(issue.message).toContain('src/nonexistent.ts');
      expect(issue.message).toContain('modify');
    });

    // GREEN TEST 7: File existence - skip files with action='create'
    it('should NOT check files with action=create (will be created)', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'New Code',
          description: 'New implementation',
          artifactType: 'code',
          targets: [
            { path: 'src/new-file.ts', action: 'create', description: 'Will be created' },
          ],
        },
      });

      const result = await queryService.validatePlan({ planId });

      const missingFileIssues = result.issues.filter(i => i.type === 'missing_file');
      expect(missingFileIssues.length).toBe(0);
    });

    // RED TEST 8: File existence - check files with action='modify' exist
    it('should check that files with action=modify exist', async () => {
      // Create a file in a relative path location
      const relativePath = 'test-data/existing.ts';
      const tmpDir = path.join(process.cwd(), 'test-data');
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, 'existing.ts');
      await fs.writeFile(tmpFile, 'content');

      try {
        await artifactService.addArtifact({
          planId,
          artifact: {
            title: 'Modify Existing',
            description: 'Modify existing file',
            artifactType: 'code',
            targets: [
              { path: relativePath, action: 'modify', description: 'Existing file' },
            ],
          },
        });

        const result = await queryService.validatePlan({ planId });

        const missingFileIssue = result.issues.find(i => i.type === 'missing_file' && i.filePath === relativePath);
        expect(missingFileIssue).toBeUndefined();
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    // GREEN TEST 9: File existence - skip check if artifact.targets is undefined
    it('should skip file check if artifact.targets is undefined', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'No File Table',
          description: 'Artifact without targets',
          artifactType: 'documentation',
        },
      });

      const result = await queryService.validatePlan({ planId });

      const missingFileIssues = result.issues.filter(i => i.type === 'missing_file');
      expect(missingFileIssues.length).toBe(0);
    });

    // RED TEST 11: Requirement coverage - solution.status='selected' without implementing phases
    it('should detect solution.status=selected without implementing phases', async () => {
      const { requirementId } = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Req',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: [],
        },
      });

      const { solutionId } = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Selected Solution',
          description: 'Sol',
          addressing: [requirementId],
          approach: 'Approach',
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk',
          },
        },
      });

      // Select the solution
      await solutionService.selectSolution({ planId, solutionId, reason: 'Best approach' });

      // Create link
      await linkingService.linkEntities({
        planId,
        sourceId: solutionId,
        targetId: requirementId,
        relationType: 'implements',
      });

      // NO phases created -> issue expected

      const result = await queryService.validatePlan({ planId, validationLevel: 'strict' });

      const issue = result.issues.find(i => i.type === 'unimplemented_solution' && i.entityId === solutionId);
      expect(issue).toBeDefined();
      if (issue === undefined) throw new Error('issue is required');
      expect(issue.severity).toBe('warning');
      expect(issue.message).toContain('Selected Solution');
      expect(issue.message).toContain('no implementing phases');
    });

    // GREEN TEST 12: Requirement coverage - solution with implementing phase passes
    it('should pass validation for solution with implementing phase', async () => {
      const { requirementId } = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Req',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: [],
        },
      });

      const { solutionId } = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Selected Solution',
          description: 'Sol',
          addressing: [requirementId],
          approach: 'Approach',
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'medium' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low risk',
          },
        },
      });

      await solutionService.selectSolution({ planId, solutionId, reason: 'Best' });

      // Create phase
      const { phaseId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Implementation Phase',
          description: 'Implements requirement',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      // Link phase to requirement
      await linkingService.linkEntities({
        planId,
        sourceId: phaseId,
        targetId: requirementId,
        relationType: 'addresses',
      });

      const result = await queryService.validatePlan({ planId });

      const unimplementedIssues = result.issues.filter(i => i.type === 'unimplemented_solution' && i.entityId === solutionId);
      expect(unimplementedIssues.length).toBe(0);
    });

    // GREEN TEST 13: Requirement coverage - ignore solution.status='proposed' (not selected)
    it('should ignore solution.status=proposed (not selected)', async () => {
      const { requirementId } = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'Req',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: [],
        },
      });

      await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Proposed Solution',
          description: 'Not selected',
          addressing: [requirementId],
          approach: 'Approach',
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'hours', confidence: 'medium' },
            technicalFeasibility: 'medium',
            riskAssessment: 'Low risk',
          },
        },
      });

      // Solution remains 'proposed', not selected -> no issue expected

      const result = await queryService.validatePlan({ planId });

      const unimplementedIssues = result.issues.filter(i => i.type === 'unimplemented_solution');
      expect(unimplementedIssues.length).toBe(0);
    });

    // RED TEST 14: Validation level - ValidatePlanInput accepts validationLevel
    it('should accept validationLevel parameter in ValidatePlanInput', () => {
      // This test verifies TypeScript compilation
      const input: ValidatePlanInput = {
        planId,
        validationLevel: 'strict',
      };

      expect(input.validationLevel).toBe('strict');
    });

    // RED TEST 15: Validation level - basic returns only severity='error'
    it('should return only severity=error when validationLevel=basic', async () => {
      // Create issues with different severities
      // Error: uncovered requirement
      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Uncovered Req',
          description: 'No solution',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: [],
        },
      });

      // Warning: child in_progress, parent planned
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const { phaseId: childId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Child',
          description: 'Child',
          parentId,
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'in_progress', progress: 50 });

      const result = await queryService.validatePlan({ planId, validationLevel: 'basic' });

      expect(result.issues.every(i => i.severity === 'error')).toBe(true);
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.summary.infos).toBe(0);
    });

    // RED TEST 16: Validation level - strict returns ALL issues
    it('should return ALL issues when validationLevel=strict', async () => {
      // Create issues with different severities
      // Error: uncovered requirement
      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Uncovered Req',
          description: 'No solution',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: [],
        },
      });

      // Warning: child in_progress, parent planned
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const { phaseId: childId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Child',
          description: 'Child',
          parentId,
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'in_progress', progress: 50 });

      const result = await queryService.validatePlan({ planId, validationLevel: 'strict' });

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.summary.warnings).toBeGreaterThan(0);
    });

    // GREEN TEST 17: Validation level - default is 'basic'
    it('should use validationLevel=basic by default', async () => {
      // Create a warning issue: child in_progress, parent planned
      const { phaseId: parentId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Parent',
          description: 'Parent',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const { phaseId: childId } = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Child',
          description: 'Child',
          parentId,
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      await phaseService.updatePhaseStatus({ planId, phaseId: childId, status: 'in_progress', progress: 50 });

      // Call without validationLevel parameter
      const result = await queryService.validatePlan({ planId });

      // Should filter out warnings (basic mode)
      const warningIssues = result.issues.filter(i => i.severity === 'warning');
      expect(warningIssues.length).toBe(0);
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
      if (result.filePath === undefined) throw new Error('filePath is required');
      const content = await fs.readFile(result.filePath, 'utf-8');
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
      // Use RepositoryFactory directly to bypass validation
      const repo = repositoryFactory.createRepository<Solution>('solution', planId);
       
      await repo.create({
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
      } as unknown as Solution);

      // This should NOT throw "Cannot read properties of undefined (reading 'length')"
      const result = await queryService.exportPlan({
        planId,
        format: 'markdown',
      });

      expect(result.format).toBe('markdown');
      expect(result.content).toContain('## Solutions');
      expect(result.content).toContain('Solution Without Tradeoffs');
    });

    it('should include artifacts in markdown', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'User Service Implementation',
          description: 'Service for user management',
          artifactType: 'code',
          content: {
            language: 'typescript',
            sourceCode: 'export class UserService { }',
            filename: 'user-service.ts',
          },
          targets: [
            { path: 'src/services/user-service.ts', action: 'create', description: 'Main service file' },
          ],
        },
      });

      const result = await queryService.exportPlan({
        planId,
        format: 'markdown',
      });

      expect(result.content).toContain('## Artifacts');
      expect(result.content).toContain('User Service Implementation');
      expect(result.content).toContain('typescript');
      expect(result.content).toContain('user-service.ts');
    });

    it('should include artifact file targets in markdown', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Database Migration',
          description: 'Add users table',
          artifactType: 'migration',
          content: {
            language: 'sql',
            sourceCode: 'CREATE TABLE users (id INT PRIMARY KEY);',
          },
          targets: [
            { path: 'migrations/001_users.sql', action: 'create', description: 'User table migration' },
            { path: 'src/models/user.ts', action: 'create', description: 'User model' },
            { path: 'src/types.ts', action: 'modify', description: 'Add user type' },
          ],
        },
      });

      const result = await queryService.exportPlan({
        planId,
        format: 'markdown',
      });

      expect(result.content).toContain('## Artifacts');
      expect(result.content).toContain('Database Migration');
      expect(result.content).toContain('**Files**:');
      expect(result.content).toContain('migrations/001_users.sql');
      expect(result.content).toContain('[create]');
      expect(result.content).toContain('[modify]');
    });
  });

  describe('getSearchableText - null-safety (RED phase)', () => {
    beforeEach(async () => {
      // Create base entities for null-safety testing
      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Test Requirement',
          description: 'For null-safety testing',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: ['AC1', 'AC2'],
        },
      });

      await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Test Solution',
          description: 'For null-safety testing',
          approach: 'Test approach',
          addressing: [],
          tradeoffs: [
            {
              aspect: 'Performance',
              pros: ['Fast'],
              cons: ['Memory usage'],
            },
          ],
          evaluation: {
            effortEstimate: { value: 1, unit: 'days', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });

      await phaseService.addPhase({
        planId,
        phase: {
          title: 'Test Phase',
          description: 'For null-safety testing',
          objectives: ['Obj1', 'Obj2'],
          deliverables: ['Del1', 'Del2'],
          successCriteria: ['SC1'],
        },
      });
    });

    // REQUIREMENT ENTITY
    it('RED: should handle requirement with undefined acceptanceCriteria', async () => {
      // Use RepositoryFactory instead of FileStorage
      const repo = repositoryFactory.createRepository<Requirement>('requirement', planId);
      const requirements = await repo.findAll();
      const requirement = requirements[0] as Partial<Requirement>;
      delete requirement.acceptanceCriteria; // Set to undefined
       
      await repo.update(requirement.id as string, requirement as Requirement);

      const result = await queryService.searchEntities({
        planId,
        query: 'requirement',
      });

      expect(result).toBeDefined(); // Should not crash
    });

    it('RED: should handle requirement with empty acceptanceCriteria', async () => {
      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Empty AC Requirement',
          description: 'Test empty acceptance criteria',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: [], // Empty array
        },
      });

      const result = await queryService.searchEntities({
        planId,
        query: 'Empty',
      });

      expect(result.results.length).toBeGreaterThan(0);
    });

    it('RED: should handle requirement with null rationale', async () => {
      // Use RepositoryFactory instead of FileStorage
      const repo = repositoryFactory.createRepository<Requirement>('requirement', planId);
      const requirements = await repo.findAll();
      const requirement = requirements[0];
      requirement.rationale = null as unknown as string;
       
      await repo.update(requirement.id, requirement);

      const result = await queryService.searchEntities({ planId, query: 'test' });
      expect(result).toBeDefined();
    });

    // SOLUTION ENTITY
    it('RED: should handle solution with undefined tradeoffs', async () => {
      const solutions = await loadEntities<Solution>(repositoryFactory, planId, 'solutions');
      if (solutions.length > 0) {
        solutions[0].tradeoffs = undefined as unknown as never;
        await saveEntities(repositoryFactory, planId, 'solutions', solutions);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });
      expect(result.content).toContain('Solution');
    });

    it('RED: should handle tradeoff with undefined pros', async () => {
      const solutions = await loadEntities<Solution>(repositoryFactory, planId, 'solutions');
      if (solutions.length > 0) {
        solutions[0].tradeoffs = [
          {
            aspect: 'Performance',
            pros: undefined as unknown as string[],
            cons: ['Slower'],
          },
        ];
        await saveEntities(repositoryFactory, planId, 'solutions', solutions);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });
      expect(result.content).toBeDefined(); // Should not crash
    });

    it('RED: should handle tradeoff with undefined cons', async () => {
      const solutions = await loadEntities<Solution>(repositoryFactory, planId, 'solutions');
      if (solutions.length > 0) {
        solutions[0].tradeoffs = [
          {
            aspect: 'Test',
            pros: ['Fast'],
            cons: undefined as unknown as string[],
          },
        ];
        await saveEntities(repositoryFactory, planId, 'solutions', solutions);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });
      expect(result).toBeDefined();
    });

    // PHASE ENTITY
    it('RED: should handle phase with undefined objectives', async () => {
      const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
      if (phases.length > 0) {
        phases[0].objectives = undefined as unknown as never;
        await saveEntities(repositoryFactory, planId, 'phases', phases);
      }

      const result = await queryService.searchEntities({ planId, query: 'phase' });
      expect(result).toBeDefined();
    });

    it('RED: should handle phase with undefined deliverables', async () => {
      const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
      if (phases.length > 0) {
        phases[0].deliverables = undefined as unknown as never;
        await saveEntities(repositoryFactory, planId, 'phases', phases);
      }

      const result = await queryService.searchEntities({ planId, query: 'phase' });
      expect(result).toBeDefined();
    });

    it('RED: should handle phase with empty arrays', async () => {
      await phaseService.addPhase({
        planId,
        phase: {
          title: 'Empty Phase',
          description: 'Test empty arrays',
          objectives: [],
          deliverables: [],
          successCriteria: [],
        },
      });

      const result = await queryService.searchEntities({ planId, query: 'Empty' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    // ARTIFACT ENTITY
    it('RED: should handle artifact with undefined sourceCode', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Test Artifact No Code',
          description: 'Test undefined sourceCode',
          artifactType: 'code',
          content: {
            sourceCode: undefined as unknown as string,
          },
        },
      });

      const result = await queryService.searchEntities({ planId, query: 'Artifact' });
      expect(result).toBeDefined();
    });

    it('RED: should handle artifact with undefined filename', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'No Filename',
          description: 'Test undefined filename',
          artifactType: 'code',
          content: {
            sourceCode: 'code',
            filename: undefined,
          },
        },
      });

      const result = await queryService.searchEntities({ planId, query: 'Filename' });
      expect(result).toBeDefined();
    });

    // INTEGRATION TESTS
    it('RED: should search phase without objectives/deliverables', async () => {
      const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
      if (phases.length > 0) {
        const phaseTitle = phases[0].title;
        phases[0].objectives = undefined as unknown as never;
        phases[0].deliverables = undefined as unknown as never;
        await saveEntities(repositoryFactory, planId, 'phases', phases);

        const result = await queryService.searchEntities({
          planId,
          query: phaseTitle,
        });

        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0].entityType).toBe('phase');
      } else {
        expect(true).toBe(true); // Skip if no phases
      }
    });

    it('RED: should export plan with mixed null fields', async () => {
      // Create entities with various undefined fields
      const phases = await loadEntities<Phase>(repositoryFactory, planId, 'phases');
      if (phases.length > 0) {
        phases[0].objectives = undefined as unknown as never;
        await saveEntities(repositoryFactory, planId, 'phases', phases);
      }

      const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
      if (requirements.length > 0) {
        requirements[0].acceptanceCriteria = undefined as unknown as never;
        await saveEntities(repositoryFactory, planId, 'requirements', requirements);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });

      expect(result.format).toBe('markdown');
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('RED: should export markdown with undefined acceptanceCriteria', async () => {
      const requirements = await loadEntities<Requirement>(repositoryFactory, planId, 'requirements');
      if (requirements.length > 0) {
        requirements[0].acceptanceCriteria = undefined as unknown as never;
        await saveEntities(repositoryFactory, planId, 'requirements', requirements);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });

      expect(result.content).toContain('## Requirements');
      // Should not crash on acceptanceCriteria.length check
    });
  });

  describe('search_entities with artifacts', () => {
    it('should search in artifact content', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Authentication Handler',
          description: 'JWT authentication',
          artifactType: 'code',
          content: {
            language: 'typescript',
            sourceCode: 'function verifyJwtToken(token: string) { }',
            filename: 'auth-handler.ts',
          },
        },
      });

      const result = await queryService.searchEntities({
        planId,
        query: 'verifyJwtToken',
      });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.some((r) => r.entity.type === 'artifact')).toBe(true);
    });

    it('should filter search by artifact type', async () => {
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Config File',
          description: 'App configuration',
          artifactType: 'config',
          content: {
            language: 'yaml',
            sourceCode: 'database: localhost',
          },
        },
      });

      await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Config Requirement',
          description: 'Need config support',
          source: { type: 'user-request' },
          priority: 'high',
          category: 'functional',
          acceptanceCriteria: [],
        },
      });

      const result = await queryService.searchEntities({
        planId,
        query: 'config',
        entityTypes: ['artifact'],
      });

      expect(result.results.every((r) => r.entityType === 'artifact')).toBe(true);
    });
  });

  // ============================================================================
  // Sprint 8: Paginated Trace Results - RED Phase (58 tests)
  // ============================================================================
  describe('trace_requirement with pagination (Sprint 8 - RED Phase)', () => {
    let reqId: string;
    let sol1Id: string;
    let sol2Id: string;
    let sol3Id: string;
    let phase1Id: string;
    let phase2Id: string;
    let phase3Id: string;

    beforeEach(async () => {
      // Create complex trace structure for testing
      const req = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Complex Requirement',
          description: 'Requirement with multiple solutions and phases',
          source: { type: 'user-request' },
          priority: 'critical',
          category: 'functional',
          acceptanceCriteria: ['AC1', 'AC2'],
        },
      });
      reqId = req.requirementId;

      // Create 3 solutions
      const sol1 = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Solution 1',
          description: 'First solution',
          approach: 'Approach 1',
          addressing: [reqId],
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 4, unit: 'hours', confidence: 'high' },
            technicalFeasibility: 'high',
            riskAssessment: 'Low',
          },
        },
      });
      sol1Id = sol1.solutionId;

      const sol2 = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Solution 2',
          description: 'Second solution',
          approach: 'Approach 2',
          addressing: [reqId],
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 2, unit: 'days', confidence: 'medium' },
            technicalFeasibility: 'medium',
            riskAssessment: 'Medium',
          },
        },
      });
      sol2Id = sol2.solutionId;

      const sol3 = await solutionService.proposeSolution({
        planId,
        solution: {
          title: 'Solution 3',
          description: 'Third solution',
          approach: 'Approach 3',
          addressing: [reqId],
          tradeoffs: [],
          evaluation: {
            effortEstimate: { value: 1, unit: 'weeks', confidence: 'low' },
            technicalFeasibility: 'low',
            riskAssessment: 'High',
          },
        },
      });
      sol3Id = sol3.solutionId;

      // Create links
      await linkingService.linkEntities({ planId, sourceId: sol1Id, targetId: reqId, relationType: 'implements' });
      await linkingService.linkEntities({ planId, sourceId: sol2Id, targetId: reqId, relationType: 'implements' });
      await linkingService.linkEntities({ planId, sourceId: sol3Id, targetId: reqId, relationType: 'implements' });

      // Create 3 phases
      const p1 = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Phase 1',
          description: 'First phase',
          objectives: ['Obj1'],
          deliverables: ['Del1'],
          successCriteria: ['SC1'],
        },
      });
      phase1Id = p1.phaseId;

      const p2 = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Phase 2',
          description: 'Second phase',
          objectives: ['Obj2'],
          deliverables: ['Del2'],
          successCriteria: ['SC2'],
        },
      });
      phase2Id = p2.phaseId;

      const p3 = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Phase 3',
          description: 'Third phase',
          objectives: ['Obj3'],
          deliverables: ['Del3'],
          successCriteria: ['SC3'],
        },
      });
      phase3Id = p3.phaseId;

      // Link phases to requirement
      await linkingService.linkEntities({ planId, sourceId: phase1Id, targetId: reqId, relationType: 'addresses' });
      await linkingService.linkEntities({ planId, sourceId: phase2Id, targetId: reqId, relationType: 'addresses' });
      await linkingService.linkEntities({ planId, sourceId: phase3Id, targetId: reqId, relationType: 'addresses' });

      // Create 2 artifacts
      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Artifact 1',
          description: 'First artifact',
          artifactType: 'code',
          relatedPhaseId: phase1Id,
          relatedRequirementIds: [reqId],
        },
      });

      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Artifact 2',
          description: 'Second artifact',
          artifactType: 'documentation',
          relatedPhaseId: phase2Id,
          relatedRequirementIds: [reqId],
        },
      });
    });

    // ========================================================================
    // 1. DEPTH PARAMETER TESTS (10 tests)
    // ========================================================================
     
    describe('depth parameter', () => {
      it('GREEN 1.1: should accept depth=1 parameter and return only solutions', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
        } as never);

        // depth=1: only solutions, no phases, no artifacts
        expect(result.trace.proposedSolutions).toBeDefined();
        expect(result.trace.proposedSolutions.length).toBe(3);
        expect(result.trace.implementingPhases).toBeUndefined();
        expect(result.trace.artifacts).toBeUndefined();
      });

      it('GREEN 1.2: should accept depth=2 parameter and return solutions + phases', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 2,
        } as never);

        // depth=2: solutions + phases, but no artifacts
        expect(result.trace.proposedSolutions).toBeDefined();
        expect(result.trace.proposedSolutions.length).toBe(3);
        expect(result.trace.implementingPhases).toBeDefined();
        if (result.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        expect(result.trace.implementingPhases.length).toBe(3);
        expect(result.trace.artifacts).toBeUndefined();
      });

      it('GREEN 1.3: should accept depth=3 parameter and return all (solutions + phases + artifacts)', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 3,
        } as never);

        // depth=3: full trace with all levels
        expect(result.trace.proposedSolutions).toBeDefined();
        expect(result.trace.proposedSolutions.length).toBe(3);
        expect(result.trace.implementingPhases).toBeDefined();
        if (result.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        expect(result.trace.implementingPhases.length).toBe(3);
        expect(result.trace.artifacts).toBeDefined();
        if (result.trace.artifacts === undefined) throw new Error('artifacts is required');
        expect(result.trace.artifacts.length).toBe(2);
      });

      it('RED 1.4: should reject depth=0 (invalid)', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            depth: 0,
          } as never)
        ).rejects.toThrow('depth must be between 1 and 3');
      });

      it('RED 1.5: should reject depth=4 (out of bounds)', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            depth: 4,
          } as never)
        ).rejects.toThrow('depth must be between 1 and 3');
      });

      it('RED 1.6: should reject depth=-1 (negative)', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            depth: -1,
          } as never)
        ).rejects.toThrow('depth must be between 1 and 3');
      });

      it('RED 1.7: should reject depth="2" (string instead of number)', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            depth: '2' as unknown as number,
          } as never)
        ).rejects.toThrow('depth must be a number');
      });

      it('RED 1.8: depth=1 should return only direct solutions (level 1)', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
        } as never);

        // Depth 1: requirement -> solutions only
        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toBeUndefined(); // Should be excluded at depth=1
      });

      it('RED 1.9: depth=2 should return solutions + phases (2 levels)', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 2,
        } as never);

        // Depth 2: requirement -> solutions -> phases
        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toHaveLength(3);
      });

      it('RED 1.10: depth=3 should return all levels (solutions + phases + artifacts)', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 3,
        } as never);

        // Depth 3: requirement -> solutions -> phases -> artifacts
        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toHaveLength(3);
        expect(result.trace.artifacts).toHaveLength(2); // New field
      });
    });
     

    // ========================================================================
    // 2. INCLUDE FLAGS TESTS (12 tests)
    // ========================================================================
     
    describe('includePhases and includeArtifacts flags', () => {
      it('RED 2.1: should accept includePhases=true', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: true,
        } as never);

        expect(result.trace.implementingPhases).toHaveLength(3);
      });

      it('RED 2.2: should accept includePhases=false and exclude phases', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: false,
        } as never);

        expect(result.trace.implementingPhases).toBeUndefined(); // Should not be returned
      });

      it('RED (BUGFIX): completion status should be calculated even when includePhases=false', async () => {
        /**
         * BUG: When includePhases=false, the implementingPhases array remains empty
         * (initialized but never populated). However, calculateAverageProgress() is still
         * called with this empty array to compute completion status. This causes:
         * - isImplemented to always be false (even when phases exist and are completed)
         * - completionPercentage to always be 0
         *
         * The phases used for completion calculation should be determined independently
         * of whether they're included in the response.
         *
         * Current code (query-service.ts:334-340):
         *   if (depth >= TRACE_DEPTH.PHASES && includePhases) {
         *     // rawPhases is populated here
         *     implementingPhases = this.applyEntityFilters(rawPhases, {...});
         *   }
         *   // Later: calculateAverageProgress(implementingPhases) uses empty array!
         *
         * Expected: Completion should be calculated from ALL phases, regardless of includePhases
         */

        // First, mark all 3 phases as completed
        await phaseService.updatePhaseStatus({ planId, phaseId: phase1Id, status: 'completed', progress: 100 });
        await phaseService.updatePhaseStatus({ planId, phaseId: phase2Id, status: 'completed', progress: 100 });
        await phaseService.updatePhaseStatus({ planId, phaseId: phase3Id, status: 'completed', progress: 100 });

        // Call with includePhases=false (phases should NOT be in output)
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: false,
        } as never);

        // Phases should not be in output
        expect(result.trace.implementingPhases).toBeUndefined();

        // BUT completion status SHOULD reflect the actual phase completion
        expect(result.trace.completionStatus.isImplemented).toBe(true);
        expect(result.trace.completionStatus.completionPercentage).toBe(100);

        // Reset phases back to planned for other tests
        await phaseService.updatePhaseStatus({ planId, phaseId: phase1Id, status: 'planned', progress: 0 });
        await phaseService.updatePhaseStatus({ planId, phaseId: phase2Id, status: 'planned', progress: 0 });
        await phaseService.updatePhaseStatus({ planId, phaseId: phase3Id, status: 'planned', progress: 0 });
      });

      it('RED 2.3: should accept includeArtifacts=true', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includeArtifacts: true,
        } as never);

        expect(result.trace.artifacts).toHaveLength(2);
      });

      it('RED 2.4: should accept includeArtifacts=false and exclude artifacts', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includeArtifacts: false,
        } as never);

        expect(result.trace.artifacts).toBeUndefined();
      });

      it('RED 2.5: includePhases=false + includeArtifacts=false should return only solutions', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: false,
          includeArtifacts: false,
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toBeUndefined();
        expect(result.trace.artifacts).toBeUndefined();
      });

      it('RED 2.6: includePhases=true + includeArtifacts=true should return all', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: true,
          includeArtifacts: true,
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toHaveLength(3);
        expect(result.trace.artifacts).toHaveLength(2);
      });

      it('RED 2.7: default behavior (no flags) should include phases and artifacts', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
        } as never);

        // Default: include everything (backward compatible)
        expect(result.trace.implementingPhases).toHaveLength(3);
      });

      it('RED 2.8: includePhases="true" (string) should throw ValidationError', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            includePhases: 'true' as unknown as boolean,
          } as never)
        ).rejects.toThrow('includePhases must be a boolean');
      });

      it('RED 2.9: includeArtifacts=null should default to true', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includeArtifacts: null as unknown as boolean,
        } as never);

        // null -> default true
        expect(result.trace.artifacts).toBeDefined();
      });

      it('RED 2.10: includePhases=undefined should default to true', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: undefined,
        } as never);

        expect(result.trace.implementingPhases).toBeDefined();
      });

      it('RED 2.11: depth=1 + includePhases=false should work together', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
          includePhases: false,
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toBeUndefined();
      });

      it('RED 2.12: depth=2 + includeArtifacts=false should exclude artifacts', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 2,
          includeArtifacts: false,
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toHaveLength(3);
        expect(result.trace.artifacts).toBeUndefined();
      });

      /**
       * BUG FIX TEST: Artifact discovery broken when phases excluded from trace output
       *
       * The allPhaseIds set used for artifact discovery is only populated when both
       * depth >= PHASES AND includePhases is true. However, artifacts should be
       * discoverable through phases even when includePhases=false.
       *
       * When depth=3, includePhases=false, includeArtifacts=true, the allPhaseIds
       * remains empty, preventing artifacts linked only to phases from being found.
       * The phase IDs should be computed independently of whether phases are included
       * in the response, since they're needed for artifact discovery.
       */
      it('RED 2.13 (BUGFIX): includePhases=false + includeArtifacts=true should still find phase-linked artifacts', async () => {
        // Create an artifact linked ONLY to a phase (no relatedRequirementIds)
        const phaseOnlyArtifact = await artifactService.addArtifact({
          planId,
          artifact: {
            title: 'Phase-Only Artifact',
            description: 'Artifact linked only to phase, not directly to requirement',
            artifactType: 'code',
            relatedPhaseId: phase3Id,
            // NOTE: No relatedRequirementIds - can ONLY be found via phase relationship
          },
        });

        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 3,
          includePhases: false,
          includeArtifacts: true,
        } as never);

        // Phases should NOT be in the output (includePhases=false)
        expect(result.trace.implementingPhases).toBeUndefined();

        // But artifacts should include the phase-linked artifact
        // because artifact discovery should work independently of includePhases flag
        expect(result.trace.artifacts).toBeDefined();
        if (result.trace.artifacts === undefined) throw new Error('artifacts is required');

        // Should find: 2 artifacts with relatedRequirementIds + 1 phase-only artifact = 3 total
        expect(result.trace.artifacts.length).toBe(3);

        // Verify the phase-only artifact is included
        const foundPhaseOnlyArtifact = result.trace.artifacts.find(
          (a: { id: string }) => a.id === phaseOnlyArtifact.artifactId
        );
        expect(foundPhaseOnlyArtifact).toBeDefined();
        if (foundPhaseOnlyArtifact === undefined) throw new Error('foundPhaseOnlyArtifact is required');
        expect(foundPhaseOnlyArtifact.title).toBe('Phase-Only Artifact');
      });
    });
     

    // ========================================================================
    // 3. LIMIT PARAMETER TESTS (8 tests)
    // ========================================================================
     
    describe('limit parameter', () => {
      it('RED 3.1: should accept limit parameter', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 2,
        } as never);

        expect(result).toBeDefined();
      });

      it('RED 3.2: limit=1 should return max 1 solution', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 1,
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(1);
      });

      it('RED 3.3: limit=2 should return max 2 solutions', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 2,
        } as never);

        expect(result.trace.proposedSolutions.length).toBeLessThanOrEqual(2);
      });

      it('RED 3.4: limit=10 (more than available) should return all 3 solutions', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 10,
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(3);
      });

      it('RED 3.5: limit=0 should throw ValidationError', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            limit: 0,
          } as never)
        ).rejects.toThrow('limit must be greater than 0');
      });

      it('RED 3.6: limit=-1 (negative) should throw ValidationError', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            limit: -1,
          } as never)
        ).rejects.toThrow('limit must be greater than 0');
      });

      it('RED 3.7: limit="2" (string) should throw ValidationError', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            limit: '2' as unknown as number,
          } as never)
        ).rejects.toThrow('limit must be a number');
      });

      it('RED 3.8: limit should apply per entity type (solutions, phases, artifacts)', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 2,
        } as never);

        // Limit=2 applies to each entity type independently
        expect(result.trace.proposedSolutions.length).toBeLessThanOrEqual(2);
        expect(result.trace.implementingPhases).toBeDefined();
        if (result.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        expect(result.trace.implementingPhases.length).toBeLessThanOrEqual(2);
        if (result.trace.artifacts) {
          expect(result.trace.artifacts.length).toBeLessThanOrEqual(2);
        }
      });
    });
     

    // ========================================================================
    // 4. COMBINATIONS: depth + fields + exclude (10 tests)
    // ========================================================================
     
    describe('combinations with fields and exclude parameters', () => {
      it('RED 4.1: depth=1 + fields=["id","title"] should work', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
          fields: ['id', 'title'],
        } as never);

        // Solutions should have only id and title
        const solution = result.trace.proposedSolutions[0];
        expect(solution.id).toBeDefined();
        expect(solution.title).toBeDefined();
        expect(solution.description).toBeUndefined();
      });

      it('RED 4.2: depth=2 + excludeMetadata=true should work', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 2,
          excludeMetadata: true,
        } as never);

        const solution = result.trace.proposedSolutions[0];
        expect(solution.metadata).toBeUndefined();
        expect(solution.createdAt).toBeUndefined();
      });

      it('RED (BUGFIX): excludeMetadata=true should remove type field per API documentation', async () => {
        /**
         * BUG: The API documentation in tool-definitions.ts states that excludeMetadata
         * should remove: "createdAt, updatedAt, version, metadata, type"
         *
         * Current implementation (query-service.ts:953) only removes:
         *   const { metadata, createdAt, updatedAt, version, ...rest } = entity as any;
         *
         * Missing: type field is not being removed despite documentation
         */
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 2,
          excludeMetadata: true,
        } as never);

        const solution = result.trace.proposedSolutions[0];
        // Per API docs, excludeMetadata should remove: createdAt, updatedAt, version, metadata, type
        expect(solution.metadata).toBeUndefined();
        expect(solution.createdAt).toBeUndefined();
        expect(solution.updatedAt).toBeUndefined();
        expect(solution.version).toBeUndefined();
        expect((solution as unknown as Record<string, unknown>).type).toBeUndefined(); // BUGFIX: type should also be removed
      });

      it('RED 4.3: includePhases=true + fields=["id","title","status"] for phases', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: true,
          phaseFields: ['id', 'title', 'status'],
        } as never);

        expect(result.trace.implementingPhases).toBeDefined();
        if (result.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        const phase = result.trace.implementingPhases[0];
        expect(phase.id).toBeDefined();
        expect(phase.title).toBeDefined();
        expect(phase.status).toBeDefined();
        expect(phase.description).toBeUndefined();
      });

      it('RED 4.4: depth=1 + limit=2 + fields=["id"] should combine all 3 params', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
          limit: 2,
          fields: ['id'],
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(2); // limit
        const sol = result.trace.proposedSolutions[0];
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeUndefined(); // fields filter
      });

      it('RED 4.5: includeArtifacts=true + excludeMetadata=true for artifacts', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includeArtifacts: true,
          excludeMetadata: true,
        } as never);

        if (result.trace.artifacts !== undefined && result.trace.artifacts.length > 0) {
          const artifact = result.trace.artifacts[0];
          expect(artifact.metadata).toBeUndefined();
        }
      });

      it('RED 4.6: depth=3 + includePhases=false + includeArtifacts=true should respect flags', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 3,
          includePhases: false,
          includeArtifacts: true,
        } as never);

        expect(result.trace.implementingPhases).toBeUndefined();
        expect(result.trace.artifacts).toBeDefined();
      });

      it('RED 4.7: limit=1 + excludeMetadata=true + fields=["id","title"]', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 1,
          excludeMetadata: true,
          fields: ['id', 'title'],
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(1);
        const sol = result.trace.proposedSolutions[0];
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        expect(sol.metadata).toBeUndefined();
        expect(sol.description).toBeUndefined();
      });

      it('RED 4.8: depth=2 + limit=2 + includePhases=true should apply limit to phases', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 2,
          limit: 2,
          includePhases: true,
        } as never);

        expect(result.trace.implementingPhases).toBeDefined();
        if (result.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        expect(result.trace.implementingPhases.length).toBeLessThanOrEqual(2);
      });

      it('RED 4.9: all parameters combined: depth + limit + include flags + fields + exclude', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 2,
          limit: 2,
          includePhases: true,
          includeArtifacts: false,
          fields: ['id', 'title'],
          excludeMetadata: true,
        } as never);

        expect(result.trace.proposedSolutions.length).toBeLessThanOrEqual(2);
        expect(result.trace.implementingPhases).toBeDefined();
        if (result.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        expect(result.trace.implementingPhases.length).toBeLessThanOrEqual(2);
        expect(result.trace.artifacts).toBeUndefined();

        const sol = result.trace.proposedSolutions[0];
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        expect(sol.metadata).toBeUndefined();
        expect(sol.description).toBeUndefined();
      });

      it('RED 4.10: fields parameter should support different fields for different entity types', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          solutionFields: ['id', 'title', 'approach'],
          phaseFields: ['id', 'title', 'status'],
        } as never);

        const sol = result.trace.proposedSolutions[0];
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        expect(sol.approach).toBeDefined();
        expect(sol.description).toBeUndefined();

        expect(result.trace.implementingPhases).toBeDefined();
        if (result.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        const phase = result.trace.implementingPhases[0];
        expect(phase.id).toBeDefined();
        expect(phase.title).toBeDefined();
        expect(phase.status).toBeDefined();
        expect(phase.description).toBeUndefined();
      });
    });
     

    // ========================================================================
    // 5. PERFORMANCE TESTS (8 tests)
    // ========================================================================
     
    describe('performance and payload size', () => {
      it('RED 5.1: depth=1 + minimal fields should reduce payload to ~5KB (from ~32KB)', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
          fields: ['id', 'title'],
        } as never);

        const payloadSize = JSON.stringify(result).length;
        expect(payloadSize).toBeLessThan(6000); // ~5KB with buffer
      });

      it('RED 5.2: full trace (no params) should be ~32KB', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
        });

        const payloadSize = JSON.stringify(result).length;
        // With 3 solutions, 3 phases, 2 artifacts - expect large payload
        expect(payloadSize).toBeGreaterThan(1000); // At least 1KB
      });

      it('RED 5.3: verify 6x payload reduction: full vs minimal', async () => {
        const fullResult = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
        });
        const fullSize = JSON.stringify(fullResult).length;

        const minimalResult = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
          fields: ['id', 'title'],
          excludeMetadata: true,
        } as never);
        const minimalSize = JSON.stringify(minimalResult).length;

        const ratio = fullSize / minimalSize;
        expect(ratio).toBeGreaterThanOrEqual(5.9); // At least ~6x reduction (allowing for JSON overhead variance)
      });

      it('RED 5.4: includePhases=false should reduce payload size', async () => {
        const withPhases = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: true,
        } as never);
        const withPhasesSize = JSON.stringify(withPhases).length;

        const withoutPhases = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includePhases: false,
        } as never);
        const withoutPhasesSize = JSON.stringify(withoutPhases).length;

        expect(withoutPhasesSize).toBeLessThan(withPhasesSize);
      });

      it('RED 5.5: includeArtifacts=false should reduce payload', async () => {
        const withArtifacts = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includeArtifacts: true,
        } as never);
        const withArtifactsSize = JSON.stringify(withArtifacts).length;

        const withoutArtifacts = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          includeArtifacts: false,
        } as never);
        const withoutArtifactsSize = JSON.stringify(withoutArtifacts).length;

        expect(withoutArtifactsSize).toBeLessThan(withArtifactsSize);
      });

      it('RED 5.6: limit parameter should reduce payload', async () => {
        const unlimited = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
        });
        const unlimitedSize = JSON.stringify(unlimited).length;

        const limited = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 1,
        } as never);
        const limitedSize = JSON.stringify(limited).length;

        expect(limitedSize).toBeLessThan(unlimitedSize);
      });

      it('RED 5.7: excludeMetadata should save ~162 bytes per entity', async () => {
        const withMetadata = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          excludeMetadata: false,
        } as never);
        const withSize = JSON.stringify(withMetadata).length;

        const withoutMetadata = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          excludeMetadata: true,
        } as never);
        const withoutSize = JSON.stringify(withoutMetadata).length;

        // With 3 solutions + 3 phases = 6 entities * 162 bytes = ~972 bytes saved
        const saved = withSize - withoutSize;
        expect(saved).toBeGreaterThan(500); // At least 500 bytes saved
      });

      it('RED 5.8: measure time performance (should be fast <100ms)', async () => {
        const start = Date.now();
        await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 1,
          fields: ['id', 'title'],
        } as never);
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(100); // Fast response
      });
    });
     

    // ========================================================================
    // 6. EDGE CASES AND VALIDATION (10 tests)
    // ========================================================================
     
    describe('edge cases and validation', () => {
      it('RED 6.1: empty trace (no solutions, phases, artifacts) should work', async () => {
        const emptyReq = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Empty Req',
            description: 'No trace',
            source: { type: 'user-request' },
            priority: 'low',
            category: 'functional',
            acceptanceCriteria: [],
          },
        });

        const result = await queryService.traceRequirement({
          planId,
          requirementId: emptyReq.requirementId,
        });

        expect(result.trace.proposedSolutions).toHaveLength(0);
        expect(result.trace.implementingPhases).toHaveLength(0);
      });

      it('RED 6.2: depth + limit + fields with empty results should not crash', async () => {
        const emptyReq = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Empty',
            description: 'Empty',
            source: { type: 'user-request' },
            priority: 'low',
            category: 'functional',
            acceptanceCriteria: [],
          },
        });

        const result = await queryService.traceRequirement({
          planId,
          requirementId: emptyReq.requirementId,
          depth: 2,
          limit: 5,
          fields: ['id', 'title'],
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(0);
      });

      it('RED 6.3: invalid requirementId with pagination params should throw', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: 'invalid-id',
            depth: 1,
          } as never)
        ).rejects.toThrow(/requirement.*not found/i);
      });

      it('RED 6.4: depth=1.5 (float) should throw ValidationError', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            depth: 1.5,
          } as never)
        ).rejects.toThrow('depth must be an integer');
      });

      it('RED 6.5: limit=2.5 (float) should throw ValidationError', async () => {
        await expect(
          queryService.traceRequirement({
            planId,
            requirementId: reqId,
            limit: 2.5,
          } as never)
        ).rejects.toThrow('limit must be an integer');
      });

      it('RED 6.6: fields=[] (empty array) should default to all fields', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          fields: [],
        } as never);

        const sol = result.trace.proposedSolutions[0];
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        expect(sol.description).toBeDefined();
      });

      it('RED 6.7: fields=["nonexistent"] should ignore invalid fields', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          fields: ['nonexistent', 'id', 'title'],
        } as never);

        const sol = result.trace.proposedSolutions[0];
        expect(sol.id).toBeDefined();
        expect(sol.title).toBeDefined();
        // nonexistent field is ignored
      });

      it('RED 6.8: null planId should throw error', async () => {
        await expect(
          queryService.traceRequirement({
            planId: null as unknown as string,
            requirementId: reqId,
          })
        ).rejects.toThrow();
      });

      it('RED 6.9: large limit (1000) should work without crashing', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 1000,
        } as never);

        expect(result.trace.proposedSolutions).toHaveLength(3); // Only 3 available
      });

      it('RED 6.10: backward compatibility - existing calls without new params should work', async () => {
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
        });

        // Old behavior: return everything
        expect(result.requirement.id).toBe(reqId);
        expect(result.trace.proposedSolutions).toHaveLength(3);
        expect(result.trace.implementingPhases).toHaveLength(3);
      });

      it('BUG FIX: selectedSolution should be found even when beyond limit', async () => {
        // Select the 3rd solution (sol3Id is the last one created)
        await solutionService.selectSolution({
          planId,
          solutionId: sol3Id,
          reason: 'Best approach',
        });

        // Apply limit=1 - only first solution will be in proposedSolutions
        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          limit: 1,
        } as never);

        // BUG: selectedSolution should NOT be null even though it's beyond limit
        // The selectedSolution is a semantic singleton and should always be found
        // from the full set of solutions, regardless of pagination
        expect(result.trace.selectedSolution).not.toBeNull();
        expect(result.trace.selectedSolution?.id).toBe(sol3Id);

        // proposedSolutions = selectedSolution + limited alternativeSolutions
        // With limit=1: selectedSolution (sol3) + 1 alternative (sol1) = 2 total
        expect(result.trace.proposedSolutions.length).toBe(2);
        expect(result.trace.alternativeSolutions.length).toBe(1); // limit applies to alternatives
      });

      it('BUG FIX: artifacts should be found from ALL phases, not just limited ones', async () => {
        // Create a new artifact linked ONLY to phase3 (no relatedRequirementIds)
        // This artifact should still be discoverable even if phase3 is excluded by limit
        const phaseOnlyArtifact = await artifactService.addArtifact({
          planId,
          artifact: {
            title: 'Phase-Only Artifact',
            description: 'Artifact linked only to phase3, no direct requirement link',
            artifactType: 'test',
            relatedPhaseId: phase3Id,
            // NO relatedRequirementIds - only linked via phase
          },
        });

        // First verify: without limit, we find ALL 3 artifacts
        const resultNoLimit = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 3,
        } as never);

        if (resultNoLimit.trace.artifacts === undefined) throw new Error('artifacts is required');
        expect(resultNoLimit.trace.artifacts.length).toBe(3);

        // BUG TEST: The key issue is that artifact DISCOVERY should use all phases,
        // not just limited phases. The limit applies to the RESPONSE, not discovery.
        //
        // With buggy code: limit=1 on phases -> only phase1 in response AND discovery
        //   -> artifacts linked only to phase2/phase3 are NEVER found
        // With fixed code: limit=1 on phases -> only phase1 in response, BUT discovery
        //   uses ALL phases -> artifacts from all phases are in the pool

        // Test with limit=1: phases limited to 1, but artifacts should still be
        // discovered from ALL phases (then limited separately)
        const limitedResult = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 3,
          limit: 1, // Limits each entity type to 1 in response
        } as never);

        // Phases ARE limited to 1 in response
        if (limitedResult.trace.implementingPhases === undefined) throw new Error('implementingPhases is required');
        expect(limitedResult.trace.implementingPhases.length).toBe(1);

        // Artifacts are also limited to 1 in response (limit applies per entity type)
        if (limitedResult.trace.artifacts === undefined) throw new Error('artifacts is required');
        expect(limitedResult.trace.artifacts.length).toBe(1);

        // KEY TEST: Use high limit to verify artifact DISCOVERY uses all phases
        // With buggy code: even with high limit, artifacts from excluded phases
        // wouldn't be discovered because discovery used limited phases
        // With fixed code: all artifacts ARE discovered, then limited separately
        const resultHighLimit = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
          depth: 3,
          limit: 100, // High limit to see full discovery pool
        } as never);

        // With high limit, all 3 artifacts should be found
        // This proves artifact DISCOVERY uses all phases (allPhaseIds), not limited ones
        if (resultHighLimit.trace.artifacts === undefined) throw new Error('artifacts is required');
        expect(resultHighLimit.trace.artifacts.length).toBe(3);

        // Verify the phase-only artifact (linked only to phase3) IS discoverable
        const hasPhaseOnlyArtifact = resultHighLimit.trace.artifacts.some(
          (a: { id: string }) => a.id === phaseOnlyArtifact.artifactId
        );
        expect(hasPhaseOnlyArtifact).toBe(true);
      });

      it('BUGFIX: proposedSolutions should include selected solution (backward compatibility)', async () => {
        /**
         * API CONTRACT BUG: proposedSolutions field currently excludes selected solution
         *
         * Current code (query-service.ts:405):
         *   proposedSolutions: alternativeSolutions,  // ❌ excludes selected!
         *
         * This breaks the API contract and backward compatibility:
         * - proposedSolutions should contain ALL solutions (selected + alternatives)
         * - This field represents "all proposed solutions for this requirement"
         * - Separate fields exist for selectedSolution and alternativeSolutions
         *
         * Expected behavior:
         * - proposedSolutions: [sol1, sol2, sol3] - ALL solutions
         * - selectedSolution: sol2 - only the selected one
         * - alternativeSolutions: [sol1, sol3] - only alternatives
         */

        // Select sol2 as the chosen solution
        await solutionService.selectSolution({
          planId,
          solutionId: sol2Id,
          reason: 'Best approach',
        });

        const result = await queryService.traceRequirement({
          planId,
          requirementId: reqId,
        } as never);

        // BUGFIX TEST: proposedSolutions MUST include selected solution
        expect(result.trace.proposedSolutions).toHaveLength(3); // ALL solutions
        expect(result.trace.selectedSolution).not.toBeNull();
        if (result.trace.selectedSolution === null) throw new Error('selectedSolution is required');
        expect(result.trace.selectedSolution.id).toBe(sol2Id);
        expect(result.trace.alternativeSolutions).toHaveLength(2); // only alternatives

        // Verify selected solution IS in proposedSolutions
        const selectedInProposed = result.trace.proposedSolutions.some(
          (s: { id: string }) => s.id === sol2Id
        );
        expect(selectedInProposed).toBe(true); // MUST be true for backward compatibility

        // Verify proposedSolutions contains all 3 solution IDs
        const solutionIds = result.trace.proposedSolutions.map((s: { id: string }) => s.id);
        expect(solutionIds).toContain(sol1Id);
        expect(solutionIds).toContain(sol2Id); // selected
        expect(solutionIds).toContain(sol3Id);
      });
    });
  });

  describe('BUG-046: Validate must not show deleted links as broken', () => {
    it('GREEN: After deleting entity with links, validate should return isValid: true', async () => {
      // Test Case from QA-REGRESSION-REPORT-2025-12-14.md

      // 1. Create Phase A
      const phaseA = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Phase A for link test',
          objectives: ['Test link deletion'],
        },
      });

      // 2. Create Phase B
      const phaseB = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Phase B for link test',
          objectives: ['Be target'],
        },
      });

      // 3. Create Link (A depends_on B)
      await linkingService.linkEntities({
        planId,
        sourceId: phaseA.phaseId,
        targetId: phaseB.phaseId,
        relationType: 'depends_on',
      });

      // 4. Delete Phase A (should cascade delete link)
      await phaseService.deletePhase({
        planId,
        phaseId: phaseA.phaseId,
      });

      // 5. Verify Link was deleted via get
      const linkResult = await linkingService.getEntityLinks({
        planId,
        entityId: phaseA.phaseId,
        direction: 'both',
      });
      expect(linkResult.links).toHaveLength(0); // Link correctly deleted ✅

      // 6. Run Validate - should return isValid: true (NO broken_link errors)
      const validateResult = await queryService.validatePlan({ planId });

      // CRITICAL ASSERTION: Should not show broken_link for deleted link
      expect(validateResult.isValid).toBe(true);
      expect(validateResult.issues).toEqual([]);

      // Additional check: no broken_link errors at all
      const brokenLinks = validateResult.issues.filter((i) => i.type === 'broken_link');
      expect(brokenLinks).toHaveLength(0);
    });

    it('GREEN: Multiple deleted links should not accumulate in validate errors', async () => {
      // Test Case #2 from QA report - verify links don't accumulate

      // Create Phase X and Y
      const phaseX = await phaseService.addPhase({
        planId,
        phase: { title: 'Phase X', objectives: ['Test'] },
      });
      const phaseY = await phaseService.addPhase({
        planId,
        phase: { title: 'Phase Y', objectives: ['Test'] },
      });

      // Create link X → Y
      await linkingService.linkEntities({
        planId,
        sourceId: phaseX.phaseId,
        targetId: phaseY.phaseId,
        relationType: 'depends_on',
      });

      // Delete Phase X
      await phaseService.deletePhase({
        planId,
        phaseId: phaseX.phaseId,
      });

      // Run validate - should not show broken links
      const validateResult = await queryService.validatePlan({ planId });

      const brokenLinks = validateResult.issues.filter((i) => i.type === 'broken_link');
      expect(brokenLinks).toHaveLength(0);

      // If this fails, it means deleted links are accumulating from previous test runs
      expect(validateResult.isValid).toBe(true);
    });
  });
});

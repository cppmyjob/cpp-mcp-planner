import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QueryService } from '../../src/domain/services/query-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { RequirementService } from '../../src/domain/services/requirement-service.js';
import { SolutionService } from '../../src/domain/services/solution-service.js';
import { PhaseService } from '../../src/domain/services/phase-service.js';
import { ArtifactService } from '../../src/domain/services/artifact-service.js';
import { LinkingService } from '../../src/domain/services/linking-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import type { Requirement, Solution, Phase, Artifact } from '../../src/domain/entities/types.js';
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
    artifactService = new ArtifactService(storage, planService);
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
      expect(issue!.severity).toBe('error');
      expect(issue!.message).toContain('Child Phase');
      expect(issue!.message).toContain('completed');
      expect(issue!.message).toContain('Parent Phase');
      expect(issue!.message).toContain('planned');
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
      expect(issue!.severity).toBe('warning');
      expect(issue!.message).toContain('in progress');
      expect(issue!.message).toContain('planned');
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
            title: `Child Phase ${i}`,
            description: `Child ${i}`,
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
      expect(issue!.severity).toBe('info');
      expect(issue!.message).toContain('all children completed');
      expect(issue!.message).toContain('Parent Phase');
    });

    // RED TEST 6: File existence - detect missing file in artifact.fileTable
    it('should detect missing file in artifact.fileTable', async () => {
      const artifactService = new (await import('../../src/domain/services/artifact-service.js')).ArtifactService(storage, planService);

      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'Code Artifact',
          description: 'Implementation',
          artifactType: 'code',
          fileTable: [
            { path: '/absolute/nonexistent.ts', action: 'modify', description: 'Nonexistent file' },
          ],
        },
      });

      const result = await queryService.validatePlan({ planId, validationLevel: 'strict' });

      const issue = result.issues.find(i => i.type === 'missing_file');
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe('warning');
      expect(issue!.filePath).toBe('/absolute/nonexistent.ts');
      expect(issue!.message).toContain('/absolute/nonexistent.ts');
      expect(issue!.message).toContain('modify');
    });

    // GREEN TEST 7: File existence - skip files with action='create'
    it('should NOT check files with action=create (will be created)', async () => {
      const artifactService = new (await import('../../src/domain/services/artifact-service.js')).ArtifactService(storage, planService);

      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'New Code',
          description: 'New implementation',
          artifactType: 'code',
          fileTable: [
            { path: '/new-file.ts', action: 'create', description: 'Will be created' },
          ],
        },
      });

      const result = await queryService.validatePlan({ planId });

      const missingFileIssues = result.issues.filter(i => i.type === 'missing_file');
      expect(missingFileIssues.length).toBe(0);
    });

    // RED TEST 8: File existence - check files with action='modify' exist
    it('should check that files with action=modify exist', async () => {
      const artifactService = new (await import('../../src/domain/services/artifact-service.js')).ArtifactService(storage, planService);
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');

      // Create a real temp file
      const tmpDir = path.join(os.tmpdir(), `mcp-test-${Date.now()}`);
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
            fileTable: [
              { path: tmpFile, action: 'modify', description: 'Existing file' },
            ],
          },
        });

        const result = await queryService.validatePlan({ planId });

        const missingFileIssue = result.issues.find(i => i.type === 'missing_file' && i.filePath === tmpFile);
        expect(missingFileIssue).toBeUndefined();
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    // GREEN TEST 9: File existence - skip check if artifact.fileTable is undefined
    it('should skip file check if artifact.fileTable is undefined', async () => {
      const artifactService = new (await import('../../src/domain/services/artifact-service.js')).ArtifactService(storage, planService);

      await artifactService.addArtifact({
        planId,
        artifact: {
          title: 'No File Table',
          description: 'Artifact without fileTable',
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
      const linkingService = new (await import('../../src/domain/services/linking-service.js')).LinkingService(storage);
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
      expect(issue!.severity).toBe('warning');
      expect(issue!.message).toContain('Selected Solution');
      expect(issue!.message).toContain('no implementing phases');
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
      const linkingService = new (await import('../../src/domain/services/linking-service.js')).LinkingService(storage);
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
    it('should accept validationLevel parameter in ValidatePlanInput', async () => {
      // This test verifies TypeScript compilation
      const input: import('../../src/domain/services/query-service.js').ValidatePlanInput = {
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
          fileTable: [
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

    it('should include artifact file table in markdown', async () => {
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
          fileTable: [
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
      const requirements = await storage.loadEntities<Requirement>(planId, 'requirements');
      requirements[0].acceptanceCriteria = undefined as any;
      await storage.saveEntities(planId, 'requirements', requirements);

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
      const requirements = await storage.loadEntities<Requirement>(planId, 'requirements');
      requirements[0].rationale = null as any;
      await storage.saveEntities(planId, 'requirements', requirements);

      const result = await queryService.searchEntities({ planId, query: 'test' });
      expect(result).toBeDefined();
    });

    // SOLUTION ENTITY
    it('RED: should handle solution with undefined tradeoffs', async () => {
      const solutions = await storage.loadEntities<Solution>(planId, 'solutions');
      if (solutions.length > 0) {
        solutions[0].tradeoffs = undefined as any;
        await storage.saveEntities(planId, 'solutions', solutions);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });
      expect(result.content).toContain('Solution');
    });

    it('RED: should handle tradeoff with undefined pros', async () => {
      const solutions = await storage.loadEntities<Solution>(planId, 'solutions');
      if (solutions.length > 0) {
        solutions[0].tradeoffs = [
          {
            aspect: 'Performance',
            pros: undefined as any,
            cons: ['Slower'],
          },
        ];
        await storage.saveEntities(planId, 'solutions', solutions);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });
      expect(result.content).toBeDefined(); // Should not crash
    });

    it('RED: should handle tradeoff with undefined cons', async () => {
      const solutions = await storage.loadEntities<Solution>(planId, 'solutions');
      if (solutions.length > 0) {
        solutions[0].tradeoffs = [
          {
            aspect: 'Test',
            pros: ['Fast'],
            cons: undefined as any,
          },
        ];
        await storage.saveEntities(planId, 'solutions', solutions);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });
      expect(result).toBeDefined();
    });

    // PHASE ENTITY
    it('RED: should handle phase with undefined objectives', async () => {
      const phases = await storage.loadEntities<Phase>(planId, 'phases');
      if (phases.length > 0) {
        phases[0].objectives = undefined as any;
        await storage.saveEntities(planId, 'phases', phases);
      }

      const result = await queryService.searchEntities({ planId, query: 'phase' });
      expect(result).toBeDefined();
    });

    it('RED: should handle phase with undefined deliverables', async () => {
      const phases = await storage.loadEntities<Phase>(planId, 'phases');
      if (phases.length > 0) {
        phases[0].deliverables = undefined as any;
        await storage.saveEntities(planId, 'phases', phases);
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
            sourceCode: undefined as any,
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
      const phases = await storage.loadEntities<Phase>(planId, 'phases');
      if (phases.length > 0) {
        const phaseTitle = phases[0].title;
        phases[0].objectives = undefined as any;
        phases[0].deliverables = undefined as any;
        await storage.saveEntities(planId, 'phases', phases);

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
      const phases = await storage.loadEntities<Phase>(planId, 'phases');
      if (phases.length > 0) {
        phases[0].objectives = undefined as any;
        await storage.saveEntities(planId, 'phases', phases);
      }

      const requirements = await storage.loadEntities<Requirement>(planId, 'requirements');
      if (requirements.length > 0) {
        requirements[0].acceptanceCriteria = undefined as any;
        await storage.saveEntities(planId, 'requirements', requirements);
      }

      const result = await queryService.exportPlan({ planId, format: 'markdown' });

      expect(result.format).toBe('markdown');
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('RED: should export markdown with undefined acceptanceCriteria', async () => {
      const requirements = await storage.loadEntities<Requirement>(planId, 'requirements');
      if (requirements.length > 0) {
        requirements[0].acceptanceCriteria = undefined as any;
        await storage.saveEntities(planId, 'requirements', requirements);
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
});

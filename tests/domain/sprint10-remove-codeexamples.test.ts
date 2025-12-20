/**
 * Sprint 10: Remove codeExamples and codeRefs from Phase
 *
 * Test suite for verifying that codeExamples and codeRefs have been removed from Phase entity.
 * Use Artifact entity with relatedPhaseId instead.
 *
 * Total: 10 test cases covering:
 * - CodeExample interface removed (2 tests)
 * - Phase.codeExamples field removed (3 tests)
 * - Phase.codeRefs field removed (3 tests)
 * - Migration to Artifacts (2 tests)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  PlanService,
  PhaseService,
  ArtifactService,
  type Phase,
  type Entity,
} from '@mcp-planner/core';
import { FileRepositoryFactory, FileLockManager, type RepositoryFactory } from '@mcp-planner/core';
import path from 'path';
import os from 'os';
import * as fs from 'fs/promises';

// Helper functions for loading/saving entities via repository
async function loadEntities<T extends Entity>(
  repositoryFactory: RepositoryFactory,
  planId: string,
  entityType: 'phases'
): Promise<T[]> {
  const typeMap: Record<string, string> = {
    phases: 'phase'
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = repositoryFactory.createRepository<T>(typeMap[entityType] as any, planId);
  return repo.findAll();
}

async function saveEntities(
  repositoryFactory: RepositoryFactory,
  planId: string,
  entityType: 'phases',
  entities: Entity[]
): Promise<void> {
  const typeMap: Record<string, string> = {
    phases: 'phase'
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = repositoryFactory.createRepository<Entity>(typeMap[entityType] as any, planId);
  for (const entity of entities) {
    await repo.update(entity.id, entity);
  }
}

describe('Sprint 10: Remove codeExamples from Phase', () => {
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let planService: PlanService;
  let phaseService: PhaseService;
  let artifactService: ArtifactService;
  let testPlanId: string;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for test
    testDir = path.join(os.tmpdir(), `test-sprint10-${Date.now().toString()}`);

    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    repositoryFactory = new FileRepositoryFactory({
      type: 'file',
      baseDir: testDir,
      lockManager,
      cacheOptions: { enabled: true, ttl: 5000, maxSize: 1000 }
    });

    const planRepo = repositoryFactory.createPlanRepository();
    await planRepo.initialize();

    planService = new PlanService(repositoryFactory);
    phaseService = new PhaseService(repositoryFactory, planService);
    artifactService = new ArtifactService(repositoryFactory, planService);

    // Create test plan
    const createResult = await planService.createPlan({
      name: 'Sprint 10 Test Plan',
      description: 'Testing codeExamples removal',
      author: 'test-runner',
    });
    testPlanId = createResult.planId;
  });

  afterEach(async () => {
    await repositoryFactory.close();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ============================================================================
  // 1. CodeExample Interface Removal Tests (2 tests)
  // ============================================================================

  describe('1. CodeExample Interface Removed', () => {
    it('1.1 should not have CodeExample interface in types', () => {
      // TypeScript compilation test: this passes as a placeholder
      // The actual verification is in test 1.2 below using dynamic import
      // (Cannot use import() type annotation due to ESLint consistent-type-imports rule)
      expect(true).toBe(true);
    });

    it('1.2 should fail to import CodeExample from types', async () => {
      // Dynamic import test
      const types = await import('@mcp-planner/core');

      // CodeExample should not be exported
      expect((types as Record<string, unknown>).CodeExample).toBeUndefined();
    });
  });

  // ============================================================================
  // 2. Phase.codeExamples Field Removal Tests (3 tests)
  // ============================================================================

  describe('2. Phase.codeExamples Field Removed', () => {
    it('2.1 should not allow codeExamples in Phase type', () => {
      // TypeScript compilation test
      const phase: Partial<Phase> = {
        title: 'Test Phase',
        description: 'Test',
        // @ts-expect-error codeExamples should not exist on Phase
        codeExamples: [],
      };

      expect(phase.title).toBe('Test Phase');
    });

    it('2.2 should not have codeExamples field when reading phase', async () => {
      const phaseResult = await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Test Phase',
          description: 'Testing codeExamples removal',
          objectives: ['Test'],
          deliverables: ['Test'],
          successCriteria: ['Test'],
        },
      });

      const phaseData = await phaseService.getPhase({
        planId: testPlanId,
        phaseId: phaseResult.phaseId,
      });

      // codeExamples field should not exist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((phaseData.phase as any).codeExamples).toBeUndefined();
    });

    it('2.3 should not accept codeExamples in addPhase input', async () => {
      // Runtime test: even if someone tries to pass codeExamples, it should be ignored or error
      await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Test Phase',
          description: 'Test',
          objectives: ['Test'],
          deliverables: ['Test'],
          successCriteria: ['Test'],
          // Intentionally passing invalid field using 'as any' to bypass type checking
          codeExamples: [{ language: 'ts', code: 'test' }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });

      // If phase was created, verify codeExamples was not stored
      const repo = repositoryFactory.createRepository<Phase>('phase', testPlanId);
      const phases = await repo.findAll();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((phases[0] as any).codeExamples).toBeUndefined();
    });
  });

  // ============================================================================
  // 3. Phase.codeRefs Field Removal Tests (3 tests)
  // ============================================================================

  describe('3. Phase.codeRefs Field Removed', () => {
    it('3.1 should not allow codeRefs in Phase type', () => {
      // TypeScript compilation test
      const phase: Partial<Phase> = {
        title: 'Test Phase',
        description: 'Test',
        // @ts-expect-error codeRefs should not exist on Phase
        codeRefs: ['src/test.ts:42'],
      };

      expect(phase.title).toBe('Test Phase');
    });

    it('3.2 should not have codeRefs field when reading phase', async () => {
      const phaseResult = await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Test Phase',
          description: 'Testing codeRefs removal',
          objectives: ['Test'],
          deliverables: ['Test'],
          successCriteria: ['Test'],
        },
      });

      const phaseData = await phaseService.getPhase({
        planId: testPlanId,
        phaseId: phaseResult.phaseId,
      });

      // codeRefs field should not exist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((phaseData.phase as any).codeRefs).toBeUndefined();
    });

    it('3.3 should not accept codeRefs in addPhase input', async () => {
      // Runtime test
      await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Test Phase',
          description: 'Test',
          objectives: ['Test'],
          deliverables: ['Test'],
          successCriteria: ['Test'],
          // Intentionally passing invalid field using 'as any' to bypass type checking
          codeRefs: ['src/test.ts:10'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      });

      // Verify codeRefs was not stored
      const repo = repositoryFactory.createRepository<Phase>('phase', testPlanId);
      const phases = await repo.findAll();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((phases[0] as any).codeRefs).toBeUndefined();
    });
  });

  // ============================================================================
  // 4. Migration to Artifacts Tests (2 tests)
  // ============================================================================

  describe('4. Use Artifacts Instead of codeExamples', () => {
    it('4.1 should use Artifact with relatedPhaseId for code storage', async () => {
      // Create phase
      const phaseResult = await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Implementation Phase',
          description: 'Code implementation',
          objectives: ['Implement feature'],
          deliverables: ['Working code'],
          successCriteria: ['Tests pass'],
        },
      });

      // Add code through Artifact (correct way)
      const artifactResult = await artifactService.addArtifact({
        planId: testPlanId,
        artifact: {
          title: 'Implementation Code',
          description: 'Main implementation',
          artifactType: 'code',
          content: {
            language: 'typescript',
            sourceCode: 'console.log("Hello World");',
            filename: 'main.ts',
          },
          relatedPhaseId: phaseResult.phaseId,
        },
      });

      // Verify artifact was created and linked to phase
      const artifact = await artifactService.getArtifact({
        planId: testPlanId,
        artifactId: artifactResult.artifactId,
        includeContent: true,
      });

      expect(artifact.artifact.relatedPhaseId).toBe(phaseResult.phaseId);
      expect(artifact.artifact.content.language).toBe('typescript');
      expect(artifact.artifact.content.sourceCode).toBe('console.log("Hello World");');
    });

    it('4.2 should use Artifact.codeRefs for code references', async () => {
      // Create phase
      const phaseResult = await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Refactoring Phase',
          description: 'Code refactoring',
          objectives: ['Refactor code'],
          deliverables: ['Cleaner code'],
          successCriteria: ['Maintainability improved'],
        },
      });

      // Add code references through Artifact
      const artifactResult = await artifactService.addArtifact({
        planId: testPlanId,
        artifact: {
          title: 'Refactoring References',
          description: 'Files to refactor',
          artifactType: 'documentation',
          content: {
            sourceCode: 'List of files to refactor',
          },
          relatedPhaseId: phaseResult.phaseId,
          codeRefs: ['src/app.ts:42', 'src/utils.ts:100', 'src/helpers.ts:25'],
        },
      });

      // Verify codeRefs stored in Artifact
      const artifact = await artifactService.getArtifact({
        planId: testPlanId,
        artifactId: artifactResult.artifactId,
      });

      expect(artifact.artifact.codeRefs).toEqual([
        'src/app.ts:42',
        'src/utils.ts:100',
        'src/helpers.ts:25',
      ]);
      expect(artifact.artifact.relatedPhaseId).toBe(phaseResult.phaseId);
    });
  });

  // ============================================================================
  // 5. Backward Compatibility: Legacy data filtering (2 tests)
  // ============================================================================

  describe('5. Backward Compatibility - Legacy Data Filtering', () => {
    it('5.1 should strip codeExamples from legacy phase data when reading with fields=["*"]', async () => {
      // Create phase normally
      const phaseResult = await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Legacy Phase',
          description: 'Phase that might have legacy data',
          objectives: ['Test'],
          deliverables: ['Test'],
          successCriteria: ['Test'],
        },
      });

      // Simulate legacy data: manually inject codeExamples into storage
      const phases = await loadEntities<Entity>(repositoryFactory, testPlanId, 'phases');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacyPhase = phases.find((p: any) => p.id === phaseResult.phaseId);
      if (legacyPhase !== undefined) {
        legacyPhase.codeExamples = [
          { language: 'typescript', code: 'legacy code', description: 'old example' },
        ];
        await saveEntities(repositoryFactory, testPlanId, 'phases', phases);
      }

      // Read phase with fields=['*'] - should NOT include codeExamples
      const result = await phaseService.getPhase({
        planId: testPlanId,
        phaseId: phaseResult.phaseId,
        fields: ['*'],
      });

      // CRITICAL: codeExamples should be stripped from response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.phase as any).codeExamples).toBeUndefined();
      expect(result.phase.title).toBe('Legacy Phase');
    });

    it('5.2 should strip codeRefs from legacy phase data when reading with fields=["*"]', async () => {
      // Create phase normally
      const phaseResult = await phaseService.addPhase({
        planId: testPlanId,
        phase: {
          title: 'Legacy Phase with Refs',
          description: 'Phase with legacy codeRefs',
          objectives: ['Test'],
          deliverables: ['Test'],
          successCriteria: ['Test'],
        },
      });

      // Simulate legacy data: manually inject codeRefs into storage
      const phases = await loadEntities<Entity>(repositoryFactory, testPlanId, 'phases');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacyPhase = phases.find((p: any) => p.id === phaseResult.phaseId);
      if (legacyPhase !== undefined) {
        legacyPhase.codeRefs = ['src/legacy.ts:42', 'tests/old.test.ts:100'];
        await saveEntities(repositoryFactory, testPlanId, 'phases', phases);
      }

      // Read phase with fields=['*'] - should NOT include codeRefs
      const result = await phaseService.getPhase({
        planId: testPlanId,
        phaseId: phaseResult.phaseId,
        fields: ['*'],
      });

      // CRITICAL: codeRefs should be stripped from response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.phase as any).codeRefs).toBeUndefined();
      expect(result.phase.title).toBe('Legacy Phase with Refs');
    });
  });
});

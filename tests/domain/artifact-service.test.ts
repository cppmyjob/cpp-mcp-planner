import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ArtifactService,
  PlanService,
  PhaseService,
  RequirementService,
  SolutionService,
} from '@mcp-planner/core';
import { FileRepositoryFactory, FileLockManager, type RepositoryFactory } from '@mcp-planner/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ArtifactService', () => {
  let service: ArtifactService;
  let planService: PlanService;
  let phaseService: PhaseService;
  let requirementService: RequirementService;
  let solutionService: SolutionService;
  let repositoryFactory: RepositoryFactory;
  let lockManager: FileLockManager;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-artifact-test-${Date.now().toString()}`);

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
    requirementService = new RequirementService(repositoryFactory, planService);
    solutionService = new SolutionService(repositoryFactory, planService);
    service = new ArtifactService(repositoryFactory, planService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing artifacts',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await repositoryFactory.close();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('addArtifact', () => {
    // RED: Validation tests for REQUIRED fields
    describe('title validation (REQUIRED field)', () => {
      it('RED: should reject missing title (undefined)', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            // @ts-expect-error - Testing invalid input
            title: undefined,
            artifactType: 'code',
            description: 'Test artifact',
          },
        })).rejects.toThrow('title is required');
      });

      it('RED: should reject empty title', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: '',
            artifactType: 'code',
            description: 'Test artifact',
          },
        })).rejects.toThrow('title must be a non-empty string');
      });

      it('RED: should reject whitespace-only title', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: '   ',
            artifactType: 'code',
            description: 'Test artifact',
          },
        })).rejects.toThrow('title must be a non-empty string');
      });
    });

    describe('artifactType validation (REQUIRED field)', () => {
      it('RED: should reject missing artifactType (undefined)', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            // @ts-expect-error - Testing invalid input
            artifactType: undefined,
            description: 'Test artifact',
          },
        })).rejects.toThrow('artifactType is required');
      });

      it('RED: should reject invalid artifactType', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            // @ts-expect-error - Testing invalid input
            artifactType: 'invalid-type',
            description: 'Test artifact',
          },
        })).rejects.toThrow('artifactType must be one of: code, config, migration, documentation, test, script, other');
      });
    });

    // GREEN: Tests for minimal artifact with defaults
    describe('minimal artifact with defaults', () => {
      it('GREEN: should accept minimal artifact (title + artifactType only)', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'User Model',
            artifactType: 'code',
          },
        });

        expect(result.artifactId).toBeDefined();

        // Verify defaults were applied
        const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId, fields: ['*'] });
        expect(artifact.title).toBe('User Model');
        expect(artifact.artifactType).toBe('code');
        expect(artifact.description).toBe('');  // default
        expect(artifact.slug).toBeDefined();  // auto-generated
        expect(artifact.status).toBe('draft');
      });
    });

    it('should add a code artifact', async () => {
      const result = await service.addArtifact({
        planId,
        artifact: {
          title: 'User Service',
          description: 'Service for user management',
          artifactType: 'code',
          content: {
            language: 'typescript',
            sourceCode: 'export class UserService {}',
            filename: 'user-service.ts',
          },
        },
      });

      expect(result.artifactId).toBeDefined();

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.title).toBe('User Service');
      expect(artifact.artifactType).toBe('code');
      expect(artifact.content.language).toBe('typescript');
      expect(artifact.status).toBe('draft');
    });

    it('should add artifact with targets', async () => {
      const result = await service.addArtifact({
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
          ],
        },
      });

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.targets).toHaveLength(2);
      if (artifact.targets === undefined || artifact.targets.length === 0) {
        throw new Error('Targets should be defined and not empty');
      }
      expect(artifact.targets[0].action).toBe('create');
    });

    it('should add artifact with related entities', async () => {
      // Create a real phase first for valid relatedPhaseId
      const phase = await phaseService.addPhase({
        planId,
        phase: {
          title: 'Implementation Phase',
          description: 'Test phase',
        },
      });

      // Sprint 5: Create real requirements for valid relatedRequirementIds
      const req1 = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Requirement 1',
          description: 'Test',
          priority: 'high',
          category: 'functional',
          source: { type: 'user-request' },
        },
      });
      const req2 = await requirementService.addRequirement({
        planId,
        requirement: {
          title: 'Requirement 2',
          description: 'Test',
          priority: 'medium',
          category: 'technical',
          source: { type: 'user-request' },
        },
      });

      const result = await service.addArtifact({
        planId,
        artifact: {
          title: 'Config File',
          description: 'Application config',
          artifactType: 'config',
          content: {
            language: 'yaml',
            sourceCode: 'database:\n  host: localhost',
            filename: 'config.yml',
          },
          relatedPhaseId: phase.phaseId,
          relatedRequirementIds: [req1.requirementId, req2.requirementId],
        },
      });

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.relatedPhaseId).toBe(phase.phaseId);
      expect(artifact.relatedRequirementIds).toEqual([req1.requirementId, req2.requirementId]);
    });

    // BUG #12: Foreign key validation for relatedPhaseId reference
    describe('relatedPhaseId validation (BUG #12 - Sprint 4)', () => {
      it('RED: should reject non-existent phase ID in relatedPhaseId', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with fake phase',
            artifactType: 'code',
            relatedPhaseId: 'non-existent-phase-id',
          },
        })).rejects.toThrow(/Phase.*non-existent-phase-id.*not found/i);
      });

      it('GREEN: should accept valid phase ID in relatedPhaseId', async () => {
        // Create a real phase first
        const phase = await phaseService.addPhase({
          planId,
          phase: {
            title: 'Real Phase',
            description: 'Test phase',
          },
        });

        // Should succeed with valid phase ID
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with real phase',
            artifactType: 'code',
            relatedPhaseId: phase.phaseId,
          },
        });

        expect(result.artifactId).toBeDefined();
        const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(artifact.relatedPhaseId).toBe(phase.phaseId);
      });

      it('GREEN: should accept undefined relatedPhaseId (no validation needed)', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact without phase',
            artifactType: 'code',
          },
        });

        expect(result.artifactId).toBeDefined();
      });
    });

    // Sprint 5: BUG #11 - Foreign key validation for relatedRequirementIds
    describe('relatedRequirementIds validation (BUG #11 - Sprint 5)', () => {
      it('RED: should reject non-existent requirement ID in relatedRequirementIds', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with fake requirement',
            artifactType: 'code',
            relatedRequirementIds: ['non-existent-req-id'],
          },
        })).rejects.toThrow(/Requirement.*non-existent-req-id.*not found/i);
      });

      it('RED: should reject when any requirement ID in array is non-existent', async () => {
        // Create a real requirement first
        const req = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Real Requirement',
            description: 'Test requirement',
            priority: 'high',
            category: 'functional',
            source: { type: 'user-request' },
          },
        });

        // Should fail because one ID is invalid
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with mixed requirements',
            artifactType: 'code',
            relatedRequirementIds: [req.requirementId, 'non-existent-req-id'],
          },
        })).rejects.toThrow(/Requirement.*non-existent-req-id.*not found/i);
      });

      it('GREEN: should accept valid requirement IDs in relatedRequirementIds', async () => {
        // Create real requirements first
        const req1 = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Requirement 1',
            description: 'Test',
            priority: 'high',
            category: 'functional',
            source: { type: 'user-request' },
          },
        });
        const req2 = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Requirement 2',
            description: 'Test',
            priority: 'medium',
            category: 'technical',
            source: { type: 'user-request' },
          },
        });

        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with real requirements',
            artifactType: 'code',
            relatedRequirementIds: [req1.requirementId, req2.requirementId],
          },
        });

        expect(result.artifactId).toBeDefined();
        const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(artifact.relatedRequirementIds).toEqual([req1.requirementId, req2.requirementId]);
      });

      it('GREEN: should accept empty relatedRequirementIds array', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with empty requirements',
            artifactType: 'code',
            relatedRequirementIds: [],
          },
        });

        expect(result.artifactId).toBeDefined();
      });

      it('GREEN: should accept undefined relatedRequirementIds', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact without requirements',
            artifactType: 'code',
          },
        });

        expect(result.artifactId).toBeDefined();
      });
    });

    // Sprint 5: BUG #11 - Foreign key validation for relatedSolutionId
    describe('relatedSolutionId validation (BUG #11 - Sprint 5)', () => {
      it('RED: should reject non-existent solution ID in relatedSolutionId', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with fake solution',
            artifactType: 'code',
            relatedSolutionId: 'non-existent-solution-id',
          },
        })).rejects.toThrow(/Solution.*non-existent-solution-id.*not found/i);
      });

      it('GREEN: should accept valid solution ID in relatedSolutionId', async () => {
        // Create a real requirement first (solution needs to address a requirement)
        const req = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Requirement for solution',
            description: 'Test',
            priority: 'high',
            category: 'functional',
            source: { type: 'user-request' },
          },
        });

        // Create a real solution
        const sol = await solutionService.proposeSolution({
          planId,
          solution: {
            title: 'Real Solution',
            description: 'Test solution',
            addressing: [req.requirementId],
          },
        });

        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact with real solution',
            artifactType: 'code',
            relatedSolutionId: sol.solutionId,
          },
        });

        expect(result.artifactId).toBeDefined();
        const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(artifact.relatedSolutionId).toBe(sol.solutionId);
      });

      it('GREEN: should accept undefined relatedSolutionId', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Artifact without solution',
            artifactType: 'code',
          },
        });

        expect(result.artifactId).toBeDefined();
      });
    });
  });

  describe('getArtifact', () => {
    it('should get artifact by id', async () => {
      const added = await service.addArtifact({
        planId,
        artifact: {
          title: 'Test Artifact',
          description: 'Test',
          artifactType: 'code',
          content: { language: 'js', sourceCode: 'const x = 1;' },
        },
      });

      const result = await service.getArtifact({
        planId,
        artifactId: added.artifactId,
      });

      expect(result.artifact.id).toBe(added.artifactId);
      expect(result.artifact.title).toBe('Test Artifact');
    });

    it('should throw for non-existent artifact', async () => {
      await expect(
        service.getArtifact({
          planId,
          artifactId: 'non-existent',
        })
      ).rejects.toThrow('not found');
    });
  });

  describe('updateArtifact', () => {
    it('should update artifact content', async () => {
      const added = await service.addArtifact({
        planId,
        artifact: {
          title: 'Original',
          description: 'Original desc',
          artifactType: 'code',
          content: { language: 'ts', sourceCode: 'const x = 1;' },
        },
      });

      await service.updateArtifact({
        planId,
        artifactId: added.artifactId,
        updates: {
          title: 'Updated',
          content: { language: 'ts', sourceCode: 'const y = 2;' },
        },
      });

      // Verify via getArtifact (use includeContent=true to get sourceCode)
      const { artifact } = await service.getArtifact({ planId, artifactId: added.artifactId, fields: ['*'], includeContent: true });
      expect(artifact.title).toBe('Updated');
      expect(artifact.content.sourceCode).toBe('const y = 2;');
      expect(artifact.version).toBe(2);
    });

    it('should update artifact status', async () => {
      const added = await service.addArtifact({
        planId,
        artifact: {
          title: 'Test',
          description: 'Test',
          artifactType: 'code',
          content: { language: 'ts', sourceCode: '' },
        },
      });

      await service.updateArtifact({
        planId,
        artifactId: added.artifactId,
        updates: { status: 'reviewed' },
      });

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: added.artifactId });
      expect(artifact.status).toBe('reviewed');
    });

    it('should update artifact with codeRefs', async () => {
      const added = await service.addArtifact({
        planId,
        artifact: {
          title: 'Test',
          description: 'Test',
          artifactType: 'code',
          content: { language: 'ts', sourceCode: '' },
        },
      });

      await service.updateArtifact({
        planId,
        artifactId: added.artifactId,
        updates: {
          codeRefs: ['src/updated-file.ts:50', 'tests/updated.test.ts:75'],
        },
      });

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: added.artifactId });
      expect(artifact.codeRefs).toHaveLength(2);
      if (artifact.codeRefs === undefined || artifact.codeRefs.length < 2) {
        throw new Error('CodeRefs should be defined with at least 2 elements');
      }
      expect(artifact.codeRefs[0]).toBe('src/updated-file.ts:50');
      expect(artifact.codeRefs[1]).toBe('tests/updated.test.ts:75');
    });

    it('should validate codeRefs on update', async () => {
      const added = await service.addArtifact({
        planId,
        artifact: {
          title: 'Test',
          description: 'Test',
          artifactType: 'code',
          content: { language: 'ts', sourceCode: '' },
        },
      });

      await expect(
        service.updateArtifact({
          planId,
          artifactId: added.artifactId,
          updates: {
            codeRefs: ['no-line-number'],
          },
        })
      ).rejects.toThrow(/must be in format/i);
    });

    // Sprint 5: BUG #11 - FK validation for relatedRequirementIds in updateArtifact
    describe('relatedRequirementIds validation in updateArtifact (BUG #11 - Sprint 5)', () => {
      let artifactId: string;

      beforeEach(async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            artifactType: 'code',
          },
        });
        artifactId = result.artifactId;
      });

      it('RED: should reject non-existent requirement ID in updateArtifact', async () => {
        await expect(service.updateArtifact({
          planId,
          artifactId,
          updates: {
            relatedRequirementIds: ['non-existent-req-id'],
          },
        })).rejects.toThrow(/Requirement.*non-existent-req-id.*not found/i);
      });

      it('GREEN: should accept valid requirement IDs in updateArtifact', async () => {
        const req = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Requirement for update',
            description: 'Test',
            priority: 'high',
            category: 'functional',
            source: { type: 'user-request' },
          },
        });

        const result = await service.updateArtifact({
          planId,
          artifactId,
          updates: {
            relatedRequirementIds: [req.requirementId],
          },
        });

        expect(result.success).toBe(true);
        const { artifact } = await service.getArtifact({ planId, artifactId });
        expect(artifact.relatedRequirementIds).toEqual([req.requirementId]);
      });
    });

    // Sprint 5: BUG #11 - FK validation for relatedSolutionId in updateArtifact
    describe('relatedSolutionId validation in updateArtifact (BUG #11 - Sprint 5)', () => {
      let artifactId: string;

      beforeEach(async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            artifactType: 'code',
          },
        });
        artifactId = result.artifactId;
      });

      it('RED: should reject non-existent solution ID in updateArtifact', async () => {
        await expect(service.updateArtifact({
          planId,
          artifactId,
          updates: {
            relatedSolutionId: 'non-existent-solution-id',
          },
        })).rejects.toThrow(/Solution.*non-existent-solution-id.*not found/i);
      });

      it('GREEN: should accept valid solution ID in updateArtifact', async () => {
        const req = await requirementService.addRequirement({
          planId,
          requirement: {
            title: 'Requirement for solution',
            description: 'Test',
            priority: 'high',
            category: 'functional',
            source: { type: 'user-request' },
          },
        });

        const sol = await solutionService.proposeSolution({
          planId,
          solution: {
            title: 'Solution for update',
            description: 'Test solution',
            addressing: [req.requirementId],
          },
        });

        const result = await service.updateArtifact({
          planId,
          artifactId,
          updates: {
            relatedSolutionId: sol.solutionId,
          },
        });

        expect(result.success).toBe(true);
        const { artifact } = await service.getArtifact({ planId, artifactId });
        expect(artifact.relatedSolutionId).toBe(sol.solutionId);
      });
    });
  });

  describe('listArtifacts', () => {
    beforeEach(async () => {
      await service.addArtifact({
        planId,
        artifact: {
          title: 'Code Artifact',
          description: 'Code',
          artifactType: 'code',
          content: { language: 'ts', sourceCode: '' },
        },
      });

      await service.addArtifact({
        planId,
        artifact: {
          title: 'Migration Artifact',
          description: 'SQL',
          artifactType: 'migration',
          content: { language: 'sql', sourceCode: '' },
        },
      });

      await service.addArtifact({
        planId,
        artifact: {
          title: 'Config Artifact',
          description: 'YAML',
          artifactType: 'config',
          content: { language: 'yaml', sourceCode: '' },
        },
      });
    });

    it('should list all artifacts', async () => {
      const result = await service.listArtifacts({ planId });

      expect(result.artifacts).toHaveLength(3);
    });

    it('should filter by artifactType', async () => {
      const result = await service.listArtifacts({
        planId,
        filters: { artifactType: 'code' },
      });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].title).toBe('Code Artifact');
    });
  });

  describe('deleteArtifact', () => {
    it('should delete artifact', async () => {
      const added = await service.addArtifact({
        planId,
        artifact: {
          title: 'To Delete',
          description: 'Delete me',
          artifactType: 'code',
          content: { language: 'ts', sourceCode: '' },
        },
      });

      const result = await service.deleteArtifact({
        planId,
        artifactId: added.artifactId,
      });

      expect(result.success).toBe(true);

      const list = await service.listArtifacts({ planId });
      expect(list.artifacts).toHaveLength(0);
    });

    it('should throw for non-existent artifact', async () => {
      await expect(
        service.deleteArtifact({
          planId,
          artifactId: 'non-existent',
        })
      ).rejects.toThrow('not found');
    });
  });

  describe('edge cases', () => {
    it('should add artifact without content field (documentation with targets only)', async () => {
      const result = await service.addArtifact({
        planId,
        artifact: {
          title: 'Critical Files to Read',
          description: 'Key files for implementation',
          artifactType: 'documentation',
          targets: [
            { path: 'src/services/user.ts', action: 'modify', description: 'User service' },
            { path: 'src/models/user.ts', action: 'modify', description: 'User model' },
          ],
        },
      });

      expect(result.artifactId).toBeDefined();

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.title).toBe('Critical Files to Read');
      expect(artifact.artifactType).toBe('documentation');
      expect(artifact.targets).toHaveLength(2);
      expect(artifact.content).toEqual({});
    });

    it('should throw for non-existent planId on addArtifact', async () => {
      await expect(
        service.addArtifact({
          planId: 'non-existent-plan',
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        })
      ).rejects.toThrow('Plan not found');
    });

    it('should throw for non-existent planId on getArtifact', async () => {
      await expect(
        service.getArtifact({
          planId: 'non-existent-plan',
          artifactId: 'any',
        })
      ).rejects.toThrow('Plan not found');
    });

    it('should throw for non-existent planId on updateArtifact', async () => {
      await expect(
        service.updateArtifact({
          planId: 'non-existent-plan',
          artifactId: 'any',
          updates: { title: 'New' },
        })
      ).rejects.toThrow('Plan not found');
    });

    it('should throw for non-existent planId on listArtifacts', async () => {
      await expect(
        service.listArtifacts({
          planId: 'non-existent-plan',
        })
      ).rejects.toThrow('Plan not found');
    });

    it('should throw for non-existent planId on deleteArtifact', async () => {
      await expect(
        service.deleteArtifact({
          planId: 'non-existent-plan',
          artifactId: 'any',
        })
      ).rejects.toThrow('Plan not found');
    });

    it('should throw for invalid artifactType', async () => {
      await expect(
        service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'invalid' as unknown as 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        })
      ).rejects.toThrow(/artifactType/i);
    });

    it('should throw for invalid targets action', async () => {
      await expect(
        service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            targets: [{ path: 'file.ts', action: 'invalid' as unknown as 'create' }],
          },
        })
      ).rejects.toThrow(/action/i);
    });

    it('should add artifact with codeRefs', async () => {
      const result = await service.addArtifact({
        planId,
        artifact: {
          title: 'Implementation artifact',
          description: 'Artifact with code references',
          artifactType: 'code',
          content: { language: 'typescript', sourceCode: 'export class MyClass {}' },
          codeRefs: [
            'src/services/my-service.ts:42',
            'tests/my-service.test.ts:100',
          ],
        },
      });

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.codeRefs).toHaveLength(2);
      if (artifact.codeRefs === undefined || artifact.codeRefs.length < 2) {
        throw new Error('CodeRefs should be defined with at least 2 elements');
      }
      expect(artifact.codeRefs[0]).toBe('src/services/my-service.ts:42');
      expect(artifact.codeRefs[1]).toBe('tests/my-service.test.ts:100');
    });

    it('should validate codeRefs format in addArtifact', async () => {
      await expect(
        service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            codeRefs: ['invalid-no-line-number'],
          },
        })
      ).rejects.toThrow(/must be in format/i);
    });

    it('should validate codeRefs line number in addArtifact', async () => {
      await expect(
        service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            codeRefs: ['src/file.ts:0'],
          },
        })
      ).rejects.toThrow(/line number must be a positive integer/i);
    });
  });

  describe('slug functionality', () => {
    describe('CYCLE 0: Slug format validation (Bug #13 - Sprint 6)', () => {
      it('RED: should reject slug with spaces', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: 'my slug',
          },
        })).rejects.toThrow(/must be lowercase alphanumeric with dashes/i);
      });

      it('RED: should reject slug with uppercase letters', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: 'MySlug',
          },
        })).rejects.toThrow(/must be lowercase alphanumeric with dashes/i);
      });

      it('RED: should reject slug with special characters', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: 'my@slug!',
          },
        })).rejects.toThrow(/must be lowercase alphanumeric with dashes/i);
      });

      it('RED: should reject slug with leading dash', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: '-myslug',
          },
        })).rejects.toThrow(/cannot start or end with a dash/i);
      });

      it('RED: should reject slug with trailing dash', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: 'myslug-',
          },
        })).rejects.toThrow(/cannot start or end with a dash/i);
      });

      it('RED: should reject slug with consecutive dashes', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: 'my--slug',
          },
        })).rejects.toThrow(/cannot contain consecutive dashes/i);
      });

      it('RED: should reject slug exceeding max length (100)', async () => {
        const longSlug = 'a'.repeat(101);
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: longSlug,
          },
        })).rejects.toThrow(/must not exceed 100 characters/i);
      });

      it('RED: should reject empty slug', async () => {
        await expect(service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: '',
          },
        })).rejects.toThrow(/must be a non-empty string/i);
      });

      it('GREEN: should accept valid slug format', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            artifactType: 'code',
            slug: 'my-valid-slug-123',
          },
        });

        expect(result.artifactId).toBeDefined();
        const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(artifact.slug).toBe('my-valid-slug-123');
      });
    });

    describe('CYCLE 1: Basic slug storage and retrieval', () => {
      it('should save and retrieve artifact with explicit slug', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'User Service',
            description: 'Service implementation',
            artifactType: 'code',
            content: { language: 'typescript', sourceCode: 'export class UserService {}' },
            slug: 'my-artifact',
          },
        });

        const retrieved = await service.getArtifact({
          planId,
          artifactId: result.artifactId,
        });

        expect(retrieved.artifact.slug).toBe('my-artifact');
      });
    });

    describe('CYCLE 2: Auto-generate slug from title', () => {
      it('should auto-generate slug when not provided', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'User Service Implementation',
            description: 'Service for user management',
            artifactType: 'code',
            content: { language: 'typescript', sourceCode: 'export class UserService {}' },
          },
        });

        const retrieved = await service.getArtifact({
          planId,
          artifactId: result.artifactId,
        });

        expect(retrieved.artifact.slug).toBe('user-service-implementation');
      });
    });

    describe('CYCLE 3: Slug normalization edge cases', () => {
      it('should remove special characters', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: "User's Service!!!",
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.slug).toBe('users-service');
      });

      it('should collapse multiple spaces', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Multiple   Spaces',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.slug).toBe('multiple-spaces');
      });

      it('should collapse multiple dashes', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test--Double--Dashes',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.slug).toBe('test-double-dashes');
      });

      it('should handle numbers correctly', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: '123 Numbers 456',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.slug).toBe('123-numbers-456');
      });

      it('should handle Unicode by removing non-ASCII', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Unicode Привет',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.slug).toBe('unicode');
      });

      it('should use fallback for empty results (only special chars)', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: '!!!',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.slug).toBe(`artifact-${result.artifactId}`);
      });

      it('should enforce max length of 100 characters', async () => {
        const longTitle = 'A'.repeat(150);
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: longTitle,
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.slug).toHaveLength(100);
        expect(retrieved.artifact.slug).toBe('a'.repeat(100));
      });
    });

    describe('CYCLE 4: Slug uniqueness validation', () => {
      it('should throw error for duplicate explicit slug', async () => {
        await service.addArtifact({
          planId,
          artifact: {
            title: 'First Artifact',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            slug: 'duplicate-slug',
          },
        });

        await expect(
          service.addArtifact({
            planId,
            artifact: {
              title: 'Second Artifact',
              description: 'Test',
              artifactType: 'code',
              content: { language: 'ts', sourceCode: '' },
              slug: 'duplicate-slug',
            },
          })
        ).rejects.toThrow(/slug.*duplicate-slug.*already exists/i);
      });

      it('should throw error for duplicate auto-generated slug', async () => {
        await service.addArtifact({
          planId,
          artifact: {
            title: 'Same Title',
            description: 'First',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        await expect(
          service.addArtifact({
            planId,
            artifact: {
              title: 'Same Title',
              description: 'Second',
              artifactType: 'code',
              content: { language: 'ts', sourceCode: '' },
            },
          })
        ).rejects.toThrow(/slug.*same-title.*already exists/i);
      });
    });
  });

  describe('ArtifactTarget support (Phase 2.3)', () => {
    describe('RED: addArtifact with targets field', () => {
      it('RED: should accept targets with basic path and action', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            targets: [{ path: 'src/file.ts', action: 'create' }],
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        expect(retrieved.artifact.targets).toBeDefined();
        expect(retrieved.artifact.targets).toHaveLength(1);
        if (!retrieved.artifact.targets || retrieved.artifact.targets.length === 0) {
          throw new Error('Targets should be defined and not empty');
        }
        expect(retrieved.artifact.targets[0].path).toBe('src/file.ts');
        expect(retrieved.artifact.targets[0].action).toBe('create');
      });

      it('RED: should accept targets with lineNumber', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            targets: [{ path: 'src/file.ts', action: 'modify', lineNumber: 42 }],
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        if (!retrieved.artifact.targets || retrieved.artifact.targets.length === 0) {
          throw new Error('Targets should be defined and not empty');
        }
        expect(retrieved.artifact.targets[0].lineNumber).toBe(42);
      });

      it('RED: should accept targets with lineNumber and lineEnd', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            targets: [{ path: 'src/file.ts', action: 'modify', lineNumber: 10, lineEnd: 20 }],
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        if (!retrieved.artifact.targets || retrieved.artifact.targets.length === 0) {
          throw new Error('Targets should be defined and not empty');
        }
        expect(retrieved.artifact.targets[0].lineNumber).toBe(10);
        expect(retrieved.artifact.targets[0].lineEnd).toBe(20);
      });

      it('RED: should accept targets with searchPattern', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            targets: [{ path: 'src/file.ts', action: 'modify', searchPattern: 'function.*test' }],
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        if (!retrieved.artifact.targets || retrieved.artifact.targets.length === 0) {
          throw new Error('Targets should be defined and not empty');
        }
        expect(retrieved.artifact.targets[0].searchPattern).toBe('function.*test');
      });

      it('RED: should accept targets with description', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            targets: [{ path: 'src/file.ts', action: 'create', description: 'Main source file' }],
          },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: result.artifactId });
        if (!retrieved.artifact.targets || retrieved.artifact.targets.length === 0) {
          throw new Error('Targets should be defined and not empty');
        }
        expect(retrieved.artifact.targets[0].description).toBe('Main source file');
      });
    });

    describe('RED: updateArtifact to modify targets', () => {
      it('RED: should update targets field', async () => {
        const added = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            targets: [{ path: 'old.ts', action: 'create' }],
          },
        });

        await service.updateArtifact({
          planId,
          artifactId: added.artifactId,
          updates: { targets: [{ path: 'new.ts', action: 'modify', lineNumber: 10 }] },
        });

        const retrieved = await service.getArtifact({ planId, artifactId: added.artifactId });
        expect(retrieved.artifact.targets).toHaveLength(1);
        if (!retrieved.artifact.targets || retrieved.artifact.targets.length === 0) {
          throw new Error('Targets should be defined and not empty');
        }
        expect(retrieved.artifact.targets[0].path).toBe('new.ts');
        expect(retrieved.artifact.targets[0].lineNumber).toBe(10);
      });
    });

    describe('RED: targets validation', () => {
      it('RED: should validate targets using validateTargets', async () => {
        await expect(
          service.addArtifact({
            planId,
            artifact: {
              title: 'Invalid',
              description: 'Test',
              artifactType: 'code',
              content: {},
              targets: [{ path: '', action: 'create' }], // Invalid: empty path
            },
          })
        ).rejects.toThrow(/path must be a non-empty string/);
      });
    });
  });

  describe('minimal return values (Sprint 6)', () => {
    describe('addArtifact should return only artifactId', () => {
      it('should not include full artifact object in result', async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test Artifact',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: 'console.log("test")' },
          },
        });

        expect(result.artifactId).toBeDefined();
        expect(result).not.toHaveProperty('artifact');
      });
    });

    describe('updateArtifact should return only success and artifactId', () => {
      it('should not include full artifact object in result', async () => {
        const added = await service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
          },
        });

        const result = await service.updateArtifact({
          planId,
          artifactId: added.artifactId,
          updates: { title: 'Updated' },
        });

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('artifact');
      });
    });

    describe('BUG #18: Title validation in updateArtifact (TDD - RED phase)', () => {
      let artifactId: string;

      beforeEach(async () => {
        const result = await service.addArtifact({
          planId,
          artifact: {
            title: 'Original Title',
            artifactType: 'code',
          },
        });
        artifactId = result.artifactId;
      });

      it('RED: should reject empty title', async () => {
        await expect(service.updateArtifact({
          planId,
          artifactId,
          updates: { title: '' },
        })).rejects.toThrow('title must be a non-empty string');
      });

      it('RED: should reject whitespace-only title', async () => {
        await expect(service.updateArtifact({
          planId,
          artifactId,
          updates: { title: '   ' },
        })).rejects.toThrow('title must be a non-empty string');
      });

      it('GREEN: should allow valid title update', async () => {
        const result = await service.updateArtifact({
          planId,
          artifactId,
          updates: { title: 'New Valid Title' },
        });
        expect(result.success).toBe(true);

        const updated = await service.getArtifact({
          planId,
          artifactId,
        });
        expect(updated.artifact.title).toBe('New Valid Title');
      });
    });
  });

  describe('fields parameter support', () => {
    let artId: string;
    let testPhaseId: string;

    beforeEach(async () => {
      // Create a real phase for relatedPhaseId
      const phase = await phaseService.addPhase({
        planId,
        phase: { title: 'Test Phase for Fields' },
      });
      testPhaseId = phase.phaseId;

      const result = await service.addArtifact({
        planId,
        artifact: {
          title: 'Complete Artifact',
          description: 'Full artifact description',
          slug: 'complete-artifact',
          artifactType: 'code',
          content: {
            language: 'typescript',
            sourceCode: 'const x = 1;\nconst y = 2;\n// ... 1000 lines of code',
            filename: 'test.ts',
          },
          targets: [
            { path: 'src/test.ts', action: 'create', lineNumber: 42, description: 'Main file' },
          ],
          relatedPhaseId: testPhaseId,
          codeRefs: ['src/main.ts:10'],
        },
      });
      artId = result.artifactId;
    });

    describe('getArtifact with fields', () => {
      it('should return only minimal fields when fields=["id","title"]', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          fields: ['id', 'title'],
        });

        const art = result.artifact as unknown as Record<string, unknown>;
        expect(art.id).toBe(artId);
        expect(art.title).toBe('Complete Artifact');
        expect(art.description).toBeUndefined();
        expect(art.content).toBeUndefined();
      });

      it('should return summary fields by default WITHOUT heavy sourceCode (Lazy-Load)', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
        });

        const art = result.artifact;
        expect(art.id).toBeDefined();
        expect(art.title).toBeDefined();
        expect(art.slug).toBeDefined();
        expect(art.artifactType).toBeDefined();
        expect(art.status).toBeDefined();

        // Lazy-Load: sourceCode NOT included by default (use fields=['*'] to get it)
        expect(art.content.sourceCode).toBeUndefined();
        expect(art.targets).toBeDefined();
        expect(art.codeRefs).toEqual(['src/main.ts:10']);
      });

      it('should return all fields when fields=["*"] and includeContent=true', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          fields: ['*'],
          includeContent: true, // Required for sourceCode (Variant B: explicit control)
        });

        const art = result.artifact;
        expect(art.content.sourceCode).toContain('const x = 1');
        expect(art.targets).toBeDefined();
        expect(art.codeRefs).toEqual(['src/main.ts:10']);
      });
    });

    describe('listArtifacts with fields', () => {
      it('should return summary fields by default WITHOUT sourceCode', async () => {
        const result = await service.listArtifacts({
          planId,
        });

        expect(result.artifacts.length).toBeGreaterThan(0);
        const art = result.artifacts[0];
        expect(art.id).toBeDefined();
        expect(art.title).toBeDefined();

        // sourceCode should NEVER be in list even with full mode (too heavy)
        const content = art.content as unknown as Record<string, unknown> | undefined;
        expect(content?.sourceCode).toBeUndefined();
      });

      it('should return minimal fields when specified', async () => {
        const result = await service.listArtifacts({
          planId,
          fields: ['id', 'title', 'artifactType'],
        });

        const art = result.artifacts[0] as unknown as Record<string, unknown>;
        expect(art.id).toBeDefined();
        expect(art.title).toBeDefined();
        expect(art.artifactType).toBeDefined();
        expect(art.description).toBeUndefined();
      });
    });
  });

  // Sprint 3 RED: includeContent parameter for explicit Lazy-Load control
  describe('Sprint 3 RED: includeContent parameter for Lazy-Load', () => {
    let artId: string;

    beforeEach(async () => {
      const result = await service.addArtifact({
        planId,
        artifact: {
          title: 'Heavy Artifact',
          description: 'Artifact with large sourceCode',
          artifactType: 'code',
          content: {
            language: 'typescript',
            sourceCode: '// Large source code (50KB)\n' + 'x'.repeat(50000),
            filename: 'heavy.ts',
          },
        },
      });
      artId = result.artifactId;
    });

    describe('getArtifact with includeContent', () => {
      it('RED: should NOT include sourceCode by default (includeContent=false implicit)', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
        });

        const art = result.artifact;
        expect(art.content).toBeDefined();
        expect(art.content.language).toBe('typescript');
        expect(art.content.filename).toBe('heavy.ts');
        // RED: sourceCode should be excluded by default (Lazy-Load)
        expect(art.content.sourceCode).toBeUndefined();
      });

      it('RED: should NOT include sourceCode when includeContent=false', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          includeContent: false,
        });

        expect(result.artifact.content.sourceCode).toBeUndefined();
      });

      it('RED: should include sourceCode when includeContent=true', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          includeContent: true,
        });

        const art = result.artifact;
        expect(art.content.sourceCode).toBeDefined();
        expect(art.content.sourceCode).toContain('Large source code');
        if (art.content.sourceCode === undefined) throw new Error('SourceCode should be defined');
        expect(art.content.sourceCode.length).toBeGreaterThan(50000);
      });

      it('RED: includeContent=true should work with fields parameter', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          fields: ['id', 'title', 'content'],
          includeContent: true,
        });

        const art = result.artifact as unknown as Record<string, unknown>;
        expect(art.id).toBe(artId);
        expect(art.title).toBe('Heavy Artifact');
        expect(art.description).toBeUndefined(); // not in fields

        const content = art.content as { sourceCode?: string; language?: string };
        expect(content.sourceCode).toBeDefined();
      });

      it('RED: includeContent=false should override fields=["*"]', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          fields: ['*'],
          includeContent: false,
        });

        const art = result.artifact;
        // All fields should be present
        expect(art.title).toBe('Heavy Artifact');
        expect(art.description).toBe('Artifact with large sourceCode');
        // But sourceCode should be excluded due to includeContent=false
        expect(art.content.sourceCode).toBeUndefined();
      });

      it('PREVENTIVE: includeContent=true should NOT add content when explicitly excluded from fields', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          fields: ['id', 'title', 'artifactType'], // content NOT in fields
          includeContent: true, // Should NOT override explicit field selection
        });

        const art = result.artifact as unknown as Record<string, unknown>;

        // Should only include requested fields
        expect(art.id).toBe(artId);
        expect(art.title).toBe('Heavy Artifact');
        expect(art.artifactType).toBe('code');

        // PREVENTIVE CHECK: content should NOT appear because it was explicitly excluded from fields
        // This test prevents regression - ensures includeContent respects fields parameter
        // (Different from filterPhase bug: filterArtifact has different architecture)
        expect(art.content).toBeUndefined();

        // Other fields should also be undefined
        expect(art.description).toBeUndefined();
        expect(art.slug).toBeUndefined();
      });
    });

    describe('listArtifacts with includeContent', () => {
      it('RED: should NOT include sourceCode in list by default', async () => {
        const result = await service.listArtifacts({
          planId,
        });

        const art = result.artifacts.find((a) => a.id === artId);
        expect(art).toBeDefined();
        if (art === undefined) throw new Error('Art should be defined');
        expect(art.content.sourceCode).toBeUndefined();
      });

      it('RED: should IGNORE includeContent=true in list (security: never return sourceCode in list)', async () => {
        const result = await service.listArtifacts({
          planId,
          includeContent: true,
        });

        const art = result.artifacts.find((a) => a.id === artId);
        // Even with includeContent=true, list should NEVER return sourceCode
        if (art === undefined) throw new Error('Art should be defined');
        expect(art.content.sourceCode).toBeUndefined();
      });
    });

    describe('Edge cases for includeContent', () => {
      it('RED: should handle artifact without sourceCode + includeContent=true', async () => {
        const noCodeResult = await service.addArtifact({
          planId,
          artifact: {
            title: 'Config File',
            description: 'No source code',
            artifactType: 'config',
            content: {
              filename: 'config.json',
            },
          },
        });

        const result = await service.getArtifact({
          planId,
          artifactId: noCodeResult.artifactId,
          includeContent: true,
        });

        // Should not crash, just return undefined sourceCode
        expect(result.artifact.content.sourceCode).toBeUndefined();
      });

      it('RED: should measure payload size difference (with vs without sourceCode)', async () => {
        const withoutCode = await service.getArtifact({
          planId,
          artifactId: artId,
          includeContent: false,
        });

        const withCode = await service.getArtifact({
          planId,
          artifactId: artId,
          includeContent: true,
        });

        const withoutSize = JSON.stringify(withoutCode.artifact).length;
        const withSize = JSON.stringify(withCode.artifact).length;

        // Verify significant size difference (100x as per sprint requirements)
        expect(withSize).toBeGreaterThan(withoutSize * 10); // At least 10x
        expect(withoutSize).toBeLessThan(2000); // Less than 2KB without sourceCode
        expect(withSize).toBeGreaterThan(50000); // Greater than 50KB with sourceCode
      });
    });
  });
});

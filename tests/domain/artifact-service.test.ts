import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ArtifactService } from '../../src/domain/services/artifact-service.js';
import { PlanService } from '../../src/domain/services/plan-service.js';
import { FileStorage } from '../../src/infrastructure/file-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ArtifactService', () => {
  let service: ArtifactService;
  let planService: PlanService;
  let storage: FileStorage;
  let testDir: string;
  let planId: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `mcp-artifact-test-${Date.now()}`);
    storage = new FileStorage(testDir);
    await storage.initialize();
    planService = new PlanService(storage);
    service = new ArtifactService(storage, planService);

    const plan = await planService.createPlan({
      name: 'Test Plan',
      description: 'For testing artifacts',
    });
    planId = plan.planId;
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('addArtifact', () => {
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
      expect(result.artifact.title).toBe('User Service');
      expect(result.artifact.artifactType).toBe('code');
      expect(result.artifact.content.language).toBe('typescript');
      expect(result.artifact.status).toBe('draft');
    });

    it('should add artifact with fileTable', async () => {
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
          fileTable: [
            { path: 'migrations/001_users.sql', action: 'create', description: 'User table migration' },
            { path: 'src/models/user.ts', action: 'create', description: 'User model' },
          ],
        },
      });

      expect(result.artifact.fileTable).toHaveLength(2);
      expect(result.artifact.fileTable![0].action).toBe('create');
    });

    it('should add artifact with related entities', async () => {
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
          relatedPhaseId: 'phase-123',
          relatedRequirementIds: ['req-1', 'req-2'],
        },
      });

      expect(result.artifact.relatedPhaseId).toBe('phase-123');
      expect(result.artifact.relatedRequirementIds).toEqual(['req-1', 'req-2']);
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
      ).rejects.toThrow('Artifact not found');
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

      const result = await service.updateArtifact({
        planId,
        artifactId: added.artifactId,
        updates: {
          title: 'Updated',
          content: { language: 'ts', sourceCode: 'const y = 2;' },
        },
      });

      expect(result.artifact.title).toBe('Updated');
      expect(result.artifact.content.sourceCode).toBe('const y = 2;');
      expect(result.artifact.version).toBe(2);
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

      const result = await service.updateArtifact({
        planId,
        artifactId: added.artifactId,
        updates: { status: 'reviewed' },
      });

      expect(result.artifact.status).toBe('reviewed');
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
      ).rejects.toThrow('Artifact not found');
    });
  });

  describe('edge cases', () => {
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
            artifactType: 'invalid' as any,
            content: { language: 'ts', sourceCode: '' },
          },
        })
      ).rejects.toThrow(/artifactType/i);
    });

    it('should throw for invalid fileTable action', async () => {
      await expect(
        service.addArtifact({
          planId,
          artifact: {
            title: 'Test',
            description: 'Test',
            artifactType: 'code',
            content: { language: 'ts', sourceCode: '' },
            fileTable: [{ path: 'file.ts', action: 'invalid' as any }],
          },
        })
      ).rejects.toThrow(/action/i);
    });
  });
});

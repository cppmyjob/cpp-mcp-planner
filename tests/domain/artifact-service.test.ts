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

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.title).toBe('User Service');
      expect(artifact.artifactType).toBe('code');
      expect(artifact.content.language).toBe('typescript');
      expect(artifact.status).toBe('draft');
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

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.fileTable).toHaveLength(2);
      expect(artifact.fileTable![0].action).toBe('create');
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

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: result.artifactId });
      expect(artifact.relatedPhaseId).toBe('phase-123');
      expect(artifact.relatedRequirementIds).toEqual(['req-1', 'req-2']);
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

      // Verify via getArtifact
      const { artifact } = await service.getArtifact({ planId, artifactId: added.artifactId });
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
      expect(artifact.codeRefs![0]).toBe('src/updated-file.ts:50');
      expect(artifact.codeRefs![1]).toBe('tests/updated.test.ts:75');
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
    it('should add artifact without content field (documentation with fileTable only)', async () => {
      const result = await service.addArtifact({
        planId,
        artifact: {
          title: 'Critical Files to Read',
          description: 'Key files for implementation',
          artifactType: 'documentation',
          fileTable: [
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
      expect(artifact.fileTable).toHaveLength(2);
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
      expect(artifact.codeRefs![0]).toBe('src/services/my-service.ts:42');
      expect(artifact.codeRefs![1]).toBe('tests/my-service.test.ts:100');
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
        expect(retrieved.artifact.targets![0].path).toBe('src/file.ts');
        expect(retrieved.artifact.targets![0].action).toBe('create');
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
        expect(retrieved.artifact.targets![0].lineNumber).toBe(42);
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
        expect(retrieved.artifact.targets![0].lineNumber).toBe(10);
        expect(retrieved.artifact.targets![0].lineEnd).toBe(20);
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
        expect(retrieved.artifact.targets![0].searchPattern).toBe('function.*test');
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
        expect(retrieved.artifact.targets![0].description).toBe('Main source file');
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
        expect(retrieved.artifact.targets![0].path).toBe('new.ts');
        expect(retrieved.artifact.targets![0].lineNumber).toBe(10);
      });
    });

    describe('RED: fileTable to targets migration', () => {
      it('RED: should auto-migrate fileTable to targets on read', async () => {
        // Create artifact with old fileTable field by directly manipulating storage
        const artifactId = 'test-migration-' + Date.now();
        const artifacts = await storage.loadEntities(planId, 'artifacts');

        artifacts.push({
          id: artifactId,
          type: 'artifact',
          title: 'Legacy Artifact',
          description: 'Test',
          artifactType: 'code',
          status: 'draft',
          content: {},
          fileTable: [
            { path: 'src/old.ts', action: 'create', description: 'Old format' },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
          metadata: { createdBy: 'test', tags: [], annotations: [] },
        } as any);

        await storage.saveEntities(planId, 'artifacts', artifacts);

        // Read via service - should auto-migrate
        const retrieved = await service.getArtifact({ planId, artifactId });
        expect(retrieved.artifact.targets).toBeDefined();
        expect(retrieved.artifact.targets).toHaveLength(1);
        expect(retrieved.artifact.targets![0].path).toBe('src/old.ts');
        expect(retrieved.artifact.targets![0].action).toBe('create');
        expect(retrieved.artifact.targets![0].description).toBe('Old format');
      });

      it('RED: should preserve targets if both fileTable and targets exist', async () => {
        // Edge case: if both exist, targets takes precedence
        const artifactId = 'test-both-' + Date.now();
        const artifacts = await storage.loadEntities(planId, 'artifacts');

        artifacts.push({
          id: artifactId,
          type: 'artifact',
          title: 'Both Fields',
          description: 'Test',
          artifactType: 'code',
          status: 'draft',
          content: {},
          fileTable: [{ path: 'src/old.ts', action: 'create' }],
          targets: [{ path: 'src/new.ts', action: 'modify', lineNumber: 5 }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
          metadata: { createdBy: 'test', tags: [], annotations: [] },
        } as any);

        await storage.saveEntities(planId, 'artifacts', artifacts);

        const retrieved = await service.getArtifact({ planId, artifactId });
        expect(retrieved.artifact.targets).toHaveLength(1);
        expect(retrieved.artifact.targets![0].path).toBe('src/new.ts');
        expect(retrieved.artifact.targets![0].lineNumber).toBe(5);
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
  });

  describe('fields parameter support', () => {
    let artId: string;

    beforeEach(async () => {
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
          relatedPhaseId: 'phase-123',
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

      it('should return ALL fields by default INCLUDING sourceCode', async () => {
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

        // GET operations should return all fields including heavy sourceCode
        expect(art.content.sourceCode).toContain('const x = 1');
        expect(art.targets).toBeDefined();
        expect(art.codeRefs).toEqual(['src/main.ts:10']);
      });

      it('should return all fields when fields=["*"]', async () => {
        const result = await service.getArtifact({
          planId,
          artifactId: artId,
          fields: ['*'],
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
        const content = art.content as unknown as Record<string, unknown>;
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
});

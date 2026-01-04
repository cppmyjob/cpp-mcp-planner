/**
 * RED: ProjectService Tests
 *
 * Tests for domain service that manages projects (CRUD, initialization, listing)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ProjectService } from '../../packages/core/src/domain/services/project-service.js';
import { ConfigService } from '../../packages/core/src/domain/services/config-service.js';
import { PlanService } from '../../packages/core/src/domain/services/plan-service.js';
import { FileRepositoryFactory } from '../../packages/core/src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../packages/core/src/infrastructure/repositories/file/file-lock-manager.js';
import type { ProjectConfig } from '../../packages/core/src/domain/entities/types.js';

describe('ProjectService', () => {
  let testDir: string;
  let lockManager: FileLockManager;
  let factory: FileRepositoryFactory;
  let configService: ConfigService;
  let planService: PlanService;
  let projectService: ProjectService;
  const defaultProjectId = 'test-project';

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `project-service-test-${Date.now().toString()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Initialize infrastructure
    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    factory = new FileRepositoryFactory({
      type: 'file',
      baseDir: testDir,
      projectId: defaultProjectId,
      lockManager,
    });

    // RED: ProjectService depends on ConfigService and PlanService
    configService = new ConfigService(factory);
    planService = new PlanService(factory);
    projectService = new ProjectService(configService, planService, { baseDir: testDir });
  });

  afterEach(async () => {
    // Cleanup
    await factory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('RED: constructor validation', () => {
    it('should throw ValidationError when baseDir is undefined in options', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new ProjectService(configService, planService, { baseDir: undefined as any });
      }).toThrow('baseDir is required');
    });

    it('should throw ValidationError when baseDir is null in options', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new ProjectService(configService, planService, { baseDir: null as any });
      }).toThrow('baseDir is required');
    });

    it('should throw ValidationError when baseDir is empty string', () => {
      expect(() => {
        new ProjectService(configService, planService, { baseDir: '' });
      }).toThrow('baseDir is required');
    });

    it('should throw ValidationError when baseDir is whitespace only', () => {
      expect(() => {
        new ProjectService(configService, planService, { baseDir: '   ' });
      }).toThrow('baseDir is required');
    });

    it('should accept valid baseDir', () => {
      expect(() => {
        new ProjectService(configService, planService, { baseDir: testDir });
      }).not.toThrow();
    });

    it('should use default baseDir when options not provided', () => {
      expect(() => {
        new ProjectService(configService, planService);
      }).not.toThrow();
    });

    it('should use default baseDir when options is empty object', () => {
      expect(() => {
        new ProjectService(configService, planService, {});
      }).not.toThrow();
    });
  });

  describe('RED: initProject', () => {
    it('should initialize project with config file', async () => {
      const workspacePath = path.join(testDir, 'workspace1');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = {
        projectId: 'my-project',
        name: 'My Project',
        description: 'Test project',
      };

      const result = await projectService.initProject(workspacePath, config);

      expect(result.success).toBe(true);
      expect(result.projectId).toBe('my-project');
      expect(result.configPath).toBe(path.join(workspacePath, '.mcp-config.json'));

      // Verify config file was created
      const savedConfig = await configService.loadConfig(workspacePath);
      expect(savedConfig).toEqual(config);
    });

    it('should validate workspacePath is required', async () => {
      const config: ProjectConfig = { projectId: 'test' };

      await expect(projectService.initProject('', config)).rejects.toThrow('workspacePath is required');
    });

    it('should validate config is required', async () => {
      const workspacePath = path.join(testDir, 'workspace2');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(projectService.initProject(workspacePath, null as any)).rejects.toThrow('config is required');
    });

    it('should prevent reinitializing existing project', async () => {
      const workspacePath = path.join(testDir, 'workspace3');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = { projectId: 'existing' };
      await projectService.initProject(workspacePath, config);

      await expect(projectService.initProject(workspacePath, config)).rejects.toThrow('already initialized');
    });

    it('should validate projectId format', async () => {
      const workspacePath = path.join(testDir, 'workspace4');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = { projectId: 'Invalid ID!' };

      await expect(projectService.initProject(workspacePath, config)).rejects.toThrow('Invalid projectId');
    });

    it('should create project directory structure in baseDir', async () => {
      const workspacePath = path.join(testDir, 'workspace-dir-structure');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = { projectId: 'test-project-dirs' };

      await projectService.initProject(workspacePath, config);

      // Verify directory structure: {baseDir}/{projectId}/plans
      const projectDir = path.join(testDir, 'test-project-dirs');
      const plansDir = path.join(projectDir, 'plans');

      // Check that directories exist
      await expect(fs.access(projectDir)).resolves.toBeUndefined();
      await expect(fs.access(plansDir)).resolves.toBeUndefined();

      // Verify plansDir is actually a directory
      const plansDirStat = await fs.stat(plansDir);
      expect(plansDirStat.isDirectory()).toBe(true);
    });
  });

  // GREEN: Phase 4.21 - Lowercase-only projectIds eliminate case-sensitivity issues
  describe('GREEN: Phase 4.21 - Lowercase projectId enforcement', () => {
    it('should reject projectId with uppercase letters', async () => {
      // Uppercase letters are no longer valid in projectIds
      const workspace1 = path.join(testDir, 'workspace-case-1');
      await fs.mkdir(workspace1, { recursive: true });

      // Attempt to initialize project with uppercase should fail validation
      await expect(
        projectService.initProject(workspace1, { projectId: 'My-Project' })
      ).rejects.toThrow('Invalid projectId');
    });

    it('should allow same projectId in different workspaces', async () => {
      // Duplicate projectIds across different workspaces are allowed
      // Conflicts only occur at storage level when creating plans

      const workspace1 = path.join(testDir, 'workspace-dup-1');
      const workspace2 = path.join(testDir, 'workspace-dup-2');
      await fs.mkdir(workspace1, { recursive: true });
      await fs.mkdir(workspace2, { recursive: true });

      // Initialize first project
      await projectService.initProject(workspace1, { projectId: 'shared-id' });

      // Initialize second project with same ID (should succeed)
      await projectService.initProject(workspace2, { projectId: 'shared-id' });

      // Verify both projects exist
      const config1 = await projectService.getProject(workspace1);
      const config2 = await projectService.getProject(workspace2);
      expect(config1?.projectId).toBe('shared-id');
      expect(config2?.projectId).toBe('shared-id');
    });
  });

  describe('RED: getProject', () => {
    it('should get project from workspace', async () => {
      const workspacePath = path.join(testDir, 'workspace5');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = {
        projectId: 'get-test',
        name: 'Get Test',
        description: 'Test getting project',
      };
      await projectService.initProject(workspacePath, config);

      const result = await projectService.getProject(workspacePath);

      expect(result).toEqual(config);
    });

    it('should return null for workspace without config', async () => {
      const workspacePath = path.join(testDir, 'workspace6');
      await fs.mkdir(workspacePath, { recursive: true });

      const result = await projectService.getProject(workspacePath);

      expect(result).toBeNull();
    });

    it('should validate workspacePath is required', async () => {
      await expect(projectService.getProject('')).rejects.toThrow('workspacePath is required');
    });
  });

  describe('RED: listProjects', () => {
    it('should list all projects from plans', async () => {
      // Create projects and plans
      const workspace1 = path.join(testDir, 'workspace7');
      const workspace2 = path.join(testDir, 'workspace8');
      await fs.mkdir(workspace1, { recursive: true });
      await fs.mkdir(workspace2, { recursive: true });

      await projectService.initProject(workspace1, {
        projectId: 'project1',
        name: 'Project 1',
      });
      await projectService.initProject(workspace2, {
        projectId: 'project2',
        name: 'Project 2',
      });

      // Create plans for these projects
      // Note: This requires a factory per project, which we'll handle in the implementation
      const factory1 = new FileRepositoryFactory({
        type: 'file',
        baseDir: testDir,
        projectId: 'project1',
        lockManager,
      });
      const planService1 = new PlanService(factory1);
      await planService1.createPlan({ name: 'Plan 1', description: 'Test' });
      await factory1.dispose();

      const factory2 = new FileRepositoryFactory({
        type: 'file',
        baseDir: testDir,
        projectId: 'project2',
        lockManager,
      });
      const planService2 = new PlanService(factory2);
      await planService2.createPlan({ name: 'Plan 2a', description: 'Test' });
      await planService2.createPlan({ name: 'Plan 2b', description: 'Test' });
      await factory2.dispose();

      const result = await projectService.listProjects();

      expect(result.projects).toHaveLength(2);
      expect(result.projects[0]?.id).toBe('project1');
      expect(result.projects[0]?.plansCount).toBe(1);
      expect(result.projects[1]?.id).toBe('project2');
      expect(result.projects[1]?.plansCount).toBe(2);
    });

    it('should return empty list when no projects exist', async () => {
      const result = await projectService.listProjects();

      expect(result.projects).toHaveLength(0);
    });

    it('should support pagination', async () => {
      // Create 3 projects with plans
      for (let i = 1; i <= 3; i++) {
        const workspace = path.join(testDir, `workspace-page-${String(i)}`);
        await fs.mkdir(workspace, { recursive: true });
        await projectService.initProject(workspace, {
          projectId: `project-page-${String(i)}`,
          name: `Project ${String(i)}`,
        });

        // Create a plan to make the project valid
        const factoryPage = new FileRepositoryFactory({
          type: 'file',
          baseDir: testDir,
          projectId: `project-page-${String(i)}`,
          lockManager,
        });
        const planServicePage = new PlanService(factoryPage);
        await planServicePage.createPlan({ name: `Plan ${String(i)}`, description: 'Test' });
        await factoryPage.dispose();
      }

      const result = await projectService.listProjects({ limit: 2, offset: 0 });

      expect(result.projects).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('RED: getProjectInfo', () => {
    it('should get project info with plan count', async () => {
      const workspace = path.join(testDir, 'workspace9');
      await fs.mkdir(workspace, { recursive: true });

      await projectService.initProject(workspace, {
        projectId: 'info-test',
        name: 'Info Test',
        description: 'Test project info',
      });

      // Create plans
      const factoryInfo = new FileRepositoryFactory({
        type: 'file',
        baseDir: testDir,
        projectId: 'info-test',
        lockManager,
      });
      const planServiceInfo = new PlanService(factoryInfo);
      await planServiceInfo.createPlan({ name: 'Plan A', description: 'Test' });
      await planServiceInfo.createPlan({ name: 'Plan B', description: 'Test' });
      await factoryInfo.dispose();

      const result = await projectService.getProjectInfo('info-test');

      expect(result).toBeDefined();
      expect(result?.id).toBe('info-test');
      // Note: name is undefined because getProjectInfo only has projectId, not workspace path
      // The config file (which contains the name) is in the workspace, not in storage
      expect(result?.plansCount).toBe(2);
      expect(result?.createdAt).toBeDefined();
      expect(result?.updatedAt).toBeDefined();
    });

    it('should return null for non-existent project', async () => {
      const result = await projectService.getProjectInfo('non-existent');

      expect(result).toBeNull();
    });

    it('should validate projectId is required', async () => {
      await expect(projectService.getProjectInfo('')).rejects.toThrow('projectId is required');
    });
  });

  describe('RED: deleteProject', () => {
    it('should delete project config file', async () => {
      const workspace = path.join(testDir, 'workspace10');
      await fs.mkdir(workspace, { recursive: true });

      await projectService.initProject(workspace, {
        projectId: 'delete-test',
        name: 'Delete Test',
      });

      const result = await projectService.deleteProject(workspace);

      expect(result.success).toBe(true);

      // Verify config was deleted
      const config = await configService.loadConfig(workspace);
      expect(config).toBeNull();
    });

    it('should not throw error if project does not exist', async () => {
      const workspace = path.join(testDir, 'workspace11');
      await fs.mkdir(workspace, { recursive: true });

      const result = await projectService.deleteProject(workspace);

      expect(result.success).toBe(true);
    });

    it('should validate workspacePath is required', async () => {
      await expect(projectService.deleteProject('')).rejects.toThrow('workspacePath is required');
    });
  });
});

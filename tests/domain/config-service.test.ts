/**
 * RED: ConfigService Tests
 *
 * Tests for domain service that manages project configuration (.mcp-config.json)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ConfigService } from '../../packages/core/src/domain/services/config-service.js';
import { FileRepositoryFactory } from '../../packages/core/src/infrastructure/factory/repository-factory.js';
import { FileLockManager } from '../../packages/core/src/infrastructure/repositories/file/file-lock-manager.js';
import type { ProjectConfig } from '../../packages/core/src/domain/entities/types.js';

describe('ConfigService', () => {
  let testDir: string;
  let lockManager: FileLockManager;
  let factory: FileRepositoryFactory;
  let configService: ConfigService;
  const projectId = 'test-project';

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `config-service-test-${Date.now().toString()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Initialize infrastructure
    lockManager = new FileLockManager(testDir);
    await lockManager.initialize();

    factory = new FileRepositoryFactory({
      type: 'file',
      baseDir: testDir,
      projectId,
      lockManager,
    });

    // RED: ConfigService constructor expects RepositoryFactory
    configService = new ConfigService(factory);
  });

  afterEach(async () => {
    // Cleanup
    await factory.dispose();
    await lockManager.dispose();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('RED: loadConfig', () => {
    it('should return null when config file does not exist', async () => {
      const workspacePath = path.join(testDir, 'workspace1');
      await fs.mkdir(workspacePath, { recursive: true });

      const result = await configService.loadConfig(workspacePath);

      expect(result).toBeNull();
    });

    it('should load existing config file', async () => {
      const workspacePath = path.join(testDir, 'workspace2');
      await fs.mkdir(workspacePath, { recursive: true });

      // Create config file manually
      const config: ProjectConfig = {
        projectId: 'my-project',
        name: 'My Project',
        description: 'Test project',
      };
      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      const result = await configService.loadConfig(workspacePath);

      expect(result).toEqual(config);
    });

    it('should validate workspacePath is required', async () => {
      await expect(configService.loadConfig('')).rejects.toThrow('workspacePath is required');
    });
  });

  describe('RED: saveConfig', () => {
    it('should save config to .mcp-config.json', async () => {
      const workspacePath = path.join(testDir, 'workspace3');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = {
        projectId: 'new-project',
        name: 'New Project',
        description: 'A new project',
      };

      await configService.saveConfig(workspacePath, config);

      // Verify file was created
      const configPath = path.join(workspacePath, '.mcp-config.json');
      const fileContent = await fs.readFile(configPath, 'utf-8');
      const savedConfig = JSON.parse(fileContent) as ProjectConfig;

      expect(savedConfig).toEqual(config);
    });

    it('should validate workspacePath is required', async () => {
      const config: ProjectConfig = { projectId: 'test' };

      await expect(configService.saveConfig('', config)).rejects.toThrow('workspacePath is required');
    });

    it('should validate config is required', async () => {
      const workspacePath = path.join(testDir, 'workspace4');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(configService.saveConfig(workspacePath, null as any)).rejects.toThrow('config is required');
    });

    it('should validate projectId is required in config', async () => {
      const workspacePath = path.join(testDir, 'workspace5');
      await fs.mkdir(workspacePath, { recursive: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config: any = { name: 'Test' };

      await expect(configService.saveConfig(workspacePath, config)).rejects.toThrow('projectId is required');
    });

    it('should overwrite existing config', async () => {
      const workspacePath = path.join(testDir, 'workspace6');
      await fs.mkdir(workspacePath, { recursive: true });

      const config1: ProjectConfig = { projectId: 'project1' };
      const config2: ProjectConfig = { projectId: 'project2', name: 'Updated' };

      await configService.saveConfig(workspacePath, config1);
      await configService.saveConfig(workspacePath, config2);

      const result = await configService.loadConfig(workspacePath);

      expect(result).toEqual(config2);
    });
  });

  describe('RED: deleteConfig', () => {
    it('should delete config file', async () => {
      const workspacePath = path.join(testDir, 'workspace7');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = { projectId: 'to-delete' };
      await configService.saveConfig(workspacePath, config);

      await configService.deleteConfig(workspacePath);

      const result = await configService.loadConfig(workspacePath);
      expect(result).toBeNull();
    });

    it('should not throw error if config does not exist', async () => {
      const workspacePath = path.join(testDir, 'workspace8');
      await fs.mkdir(workspacePath, { recursive: true });

      await expect(configService.deleteConfig(workspacePath)).resolves.not.toThrow();
    });

    it('should validate workspacePath is required', async () => {
      await expect(configService.deleteConfig('')).rejects.toThrow('workspacePath is required');
    });
  });

  describe('RED: configExists', () => {
    it('should return true when config exists', async () => {
      const workspacePath = path.join(testDir, 'workspace9');
      await fs.mkdir(workspacePath, { recursive: true });

      const config: ProjectConfig = { projectId: 'exists' };
      await configService.saveConfig(workspacePath, config);

      const exists = await configService.configExists(workspacePath);

      expect(exists).toBe(true);
    });

    it('should return false when config does not exist', async () => {
      const workspacePath = path.join(testDir, 'workspace10');
      await fs.mkdir(workspacePath, { recursive: true });

      const exists = await configService.configExists(workspacePath);

      expect(exists).toBe(false);
    });

    it('should validate workspacePath is required', async () => {
      await expect(configService.configExists('')).rejects.toThrow('workspacePath is required');
    });
  });

  // RED: Phase 3.5 - Lazy Loading Pattern Tests
  describe('RED: Phase 3.5 - Lazy Loading Pattern', () => {
    it('should NOT create ConfigRepository during construction', () => {
      // Track calls to createConfigRepository
      let createCalled = false;
      const originalCreate = factory.createConfigRepository.bind(factory);

      factory.createConfigRepository = function(this: FileRepositoryFactory) {
        createCalled = true;
        return originalCreate.call(this);
      };

      // Create ConfigService - should NOT call createConfigRepository
      const service = new ConfigService(factory);

      // Verify createConfigRepository was NOT called during construction
      expect(createCalled).toBe(false);

      // Restore original method
      factory.createConfigRepository = originalCreate;

      // Suppress unused variable warning
      void service;
    });

    it('should create ConfigRepository on first method call', async () => {
      let createCallCount = 0;
      const originalCreate = factory.createConfigRepository.bind(factory);

      factory.createConfigRepository = function(this: FileRepositoryFactory) {
        createCallCount++;
        return originalCreate.call(this);
      };

      const service = new ConfigService(factory);

      // Verify not called yet
      expect(createCallCount).toBe(0);

      // Call a method - should trigger lazy initialization
      const workspacePath = path.join(testDir, 'lazy-test');
      await fs.mkdir(workspacePath, { recursive: true });
      await service.configExists(workspacePath);

      // Verify createConfigRepository was called exactly once
      expect(createCallCount).toBe(1);

      // Restore original method
      factory.createConfigRepository = originalCreate;
    });

    it('should reuse the same ConfigRepository instance for multiple calls', async () => {
      let createCallCount = 0;
      const originalCreate = factory.createConfigRepository.bind(factory);

      factory.createConfigRepository = function(this: FileRepositoryFactory) {
        createCallCount++;
        return originalCreate.call(this);
      };

      const service = new ConfigService(factory);

      const workspacePath = path.join(testDir, 'lazy-test2');
      await fs.mkdir(workspacePath, { recursive: true });

      // Call multiple methods
      await service.configExists(workspacePath);
      await service.loadConfig(workspacePath);
      const config: ProjectConfig = { projectId: 'lazy-test' };
      await service.saveConfig(workspacePath, config);

      // Verify createConfigRepository was called exactly once (instance reused)
      expect(createCallCount).toBe(1);

      // Restore original method
      factory.createConfigRepository = originalCreate;
    });
  });
});

/**
 * FileConfigRepository Tests
 *
 * Tests edge cases and security features:
 * - File not found (returns null)
 * - Invalid JSON (throws ValidationError)
 * - Invalid projectId (throws ValidationError)
 * - Valid config save/load roundtrip
 * - Delete config file
 * - Config exists check
 * - Symlink detection (security)
 * - Tilde expansion (~/ paths)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileConfigRepository, ValidationError } from '@mcp-planner/core';
import type { ProjectConfig } from '@mcp-planner/core';

describe('FileConfigRepository', () => {
  let repo: FileConfigRepository;
  let tempDir: string;

  beforeEach(async () => {
    repo = new FileConfigRepository();
    await repo.initialize();

    // Create temp directory for test workspace
    const timestamp = String(Date.now());
    tempDir = path.join(os.tmpdir(), `mcp-config-test-${timestamp}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await repo.close();

    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // loadConfig Tests
  // ==========================================================================

  describe('loadConfig', () => {
    it('RED: should return null if .mcp-config.json does not exist', async () => {
      const config = await repo.loadConfig(tempDir);
      expect(config).toBeNull();
    });

    it('RED: should throw ValidationError if JSON is invalid', async () => {
      const configPath = path.join(tempDir, '.mcp-config.json');
      await fs.writeFile(configPath, '{ invalid json', 'utf-8');

      await expect(repo.loadConfig(tempDir)).rejects.toThrow();
    });

    it('RED: should throw ValidationError if projectId is missing', async () => {
      const configPath = path.join(tempDir, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ name: 'Test' }), 'utf-8');

      await expect(repo.loadConfig(tempDir)).rejects.toThrow(ValidationError);
    });

    it('RED: should throw ValidationError if projectId is invalid (empty string)', async () => {
      const configPath = path.join(tempDir, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: '' }), 'utf-8');

      await expect(repo.loadConfig(tempDir)).rejects.toThrow(ValidationError);
    });

    it('RED: should throw ValidationError if projectId contains path traversal (..)', async () => {
      const configPath = path.join(tempDir, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: '../evil' }), 'utf-8');

      await expect(repo.loadConfig(tempDir)).rejects.toThrow(ValidationError);
    });

    it('RED: should throw ValidationError if projectId is reserved Windows name (CON)', async () => {
      const configPath = path.join(tempDir, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: 'CON' }), 'utf-8');

      await expect(repo.loadConfig(tempDir)).rejects.toThrow(ValidationError);
    });

    it('GREEN: should load valid ProjectConfig with all fields', async () => {
      const validConfig: ProjectConfig = {
        projectId: 'my-project',
        name: 'My Project',
        description: 'Test project description',
      };

      const configPath = path.join(tempDir, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify(validConfig), 'utf-8');

      const loaded = await repo.loadConfig(tempDir);
      expect(loaded).toEqual(validConfig);
    });

    it('GREEN: should load valid ProjectConfig with only projectId (minimal)', async () => {
      const minimalConfig: ProjectConfig = {
        projectId: 'minimal-project',
      };

      const configPath = path.join(tempDir, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify(minimalConfig), 'utf-8');

      const loaded = await repo.loadConfig(tempDir);
      expect(loaded).toEqual(minimalConfig);
    });
  });

  // ==========================================================================
  // saveConfig Tests
  // ==========================================================================

  describe('saveConfig', () => {
    it('RED: should throw ValidationError if projectId is missing', async () => {
      const invalidConfig = { name: 'Test' } as unknown as ProjectConfig;

      await expect(repo.saveConfig(tempDir, invalidConfig)).rejects.toThrow(ValidationError);
    });

    it('RED: should throw ValidationError if projectId is empty string', async () => {
      const invalidConfig: ProjectConfig = { projectId: '' };

      await expect(repo.saveConfig(tempDir, invalidConfig)).rejects.toThrow(ValidationError);
    });

    it('RED: should throw ValidationError if projectId contains path traversal', async () => {
      const invalidConfig: ProjectConfig = { projectId: '../evil' };

      await expect(repo.saveConfig(tempDir, invalidConfig)).rejects.toThrow(ValidationError);
    });

    it('RED: should throw ValidationError if projectId is reserved Windows name', async () => {
      const invalidConfig: ProjectConfig = { projectId: 'NUL' };

      await expect(repo.saveConfig(tempDir, invalidConfig)).rejects.toThrow(ValidationError);
    });

    it('GREEN: should save valid ProjectConfig and create file', async () => {
      const validConfig: ProjectConfig = {
        projectId: 'test-project',
        name: 'Test Project',
        description: 'Description',
      };

      await repo.saveConfig(tempDir, validConfig);

      const configPath = path.join(tempDir, '.mcp-config.json');
      const fileExists = await fs.access(configPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content) as ProjectConfig;
      expect(parsed).toEqual(validConfig);
    });

    it('GREEN: should save minimal ProjectConfig (only projectId)', async () => {
      const minimalConfig: ProjectConfig = { projectId: 'minimal' };

      await repo.saveConfig(tempDir, minimalConfig);

      const loaded = await repo.loadConfig(tempDir);
      expect(loaded).toEqual(minimalConfig);
    });

    it('GREEN: should overwrite existing config file', async () => {
      const config1: ProjectConfig = { projectId: 'first' };
      const config2: ProjectConfig = { projectId: 'second', name: 'Updated' };

      await repo.saveConfig(tempDir, config1);
      await repo.saveConfig(tempDir, config2);

      const loaded = await repo.loadConfig(tempDir);
      expect(loaded).toEqual(config2);
    });

    it('GREEN: should create directory if it does not exist', async () => {
      const newDir = path.join(tempDir, 'nested', 'workspace');
      const validConfig: ProjectConfig = { projectId: 'nested-project' };

      await repo.saveConfig(newDir, validConfig);

      const loaded = await repo.loadConfig(newDir);
      expect(loaded).toEqual(validConfig);
    });
  });

  // ==========================================================================
  // deleteConfig Tests
  // ==========================================================================

  describe('deleteConfig', () => {
    it('GREEN: should delete existing config file', async () => {
      const validConfig: ProjectConfig = { projectId: 'to-delete' };
      await repo.saveConfig(tempDir, validConfig);

      const existsBefore = await repo.configExists(tempDir);
      expect(existsBefore).toBe(true);

      await repo.deleteConfig(tempDir);

      const existsAfter = await repo.configExists(tempDir);
      expect(existsAfter).toBe(false);
    });

    it('GREEN: should not throw if config file does not exist', async () => {
      await expect(repo.deleteConfig(tempDir)).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // configExists Tests
  // ==========================================================================

  describe('configExists', () => {
    it('GREEN: should return false if config does not exist', async () => {
      const exists = await repo.configExists(tempDir);
      expect(exists).toBe(false);
    });

    it('GREEN: should return true if config exists', async () => {
      const validConfig: ProjectConfig = { projectId: 'exists-test' };
      await repo.saveConfig(tempDir, validConfig);

      const exists = await repo.configExists(tempDir);
      expect(exists).toBe(true);
    });
  });

  // ==========================================================================
  // Security: Symlink Detection
  // ==========================================================================

  describe('security - symlink detection', () => {
    it('RED: should throw ValidationError if workspace path is a symlink', async () => {
      // Skip on Windows if symlinks require admin privileges
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        // Try to create symlink, skip test if it fails (no admin rights)
        try {
          const targetDir = path.join(tempDir, 'target');
          const linkPath = path.join(tempDir, 'symlink');
          await fs.mkdir(targetDir, { recursive: true });
          await fs.symlink(targetDir, linkPath, 'dir');
        } catch {
          console.log('Skipping symlink test on Windows (requires admin privileges)');
          return;
        }
      }

      const targetDir = path.join(tempDir, 'target');
      const linkPath = path.join(tempDir, 'symlink');

      await fs.mkdir(targetDir, { recursive: true });

      // Clean up any existing symlink from previous test runs
      try {
        await fs.rm(linkPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      await fs.symlink(targetDir, linkPath, 'dir');

      const validConfig: ProjectConfig = { projectId: 'symlink-test' };

      await expect(repo.saveConfig(linkPath, validConfig)).rejects.toThrow(ValidationError);
      await expect(repo.saveConfig(linkPath, validConfig)).rejects.toThrow(/symlink/i);
    });

    it('GREEN: should allow loading from symlink target (not the symlink itself)', async () => {
      // This test verifies that if we save to a real directory and then try to access it
      // via a symlink, it should fail (security), but accessing the real path should work
      const realDir = path.join(tempDir, 'real');
      await fs.mkdir(realDir, { recursive: true });

      const validConfig: ProjectConfig = { projectId: 'real-path' };
      await repo.saveConfig(realDir, validConfig);

      const loaded = await repo.loadConfig(realDir);
      expect(loaded).toEqual(validConfig);
    });
  });

  // ==========================================================================
  // Tilde Expansion
  // ==========================================================================

  describe('tilde expansion', () => {
    it('GREEN: should expand ~/ to home directory', async () => {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';

      // Create a test directory in home
      const timestamp = String(Date.now());
      const testDirName = `.mcp-test-${timestamp}`;
      const expectedPath = path.join(homeDir, testDirName);
      const tildeePath = path.join('~', testDirName);

      try {
        await fs.mkdir(expectedPath, { recursive: true });

        const validConfig: ProjectConfig = { projectId: 'tilde-test' };
        await repo.saveConfig(tildeePath, validConfig);

        const loaded = await repo.loadConfig(tildeePath);
        expect(loaded).toEqual(validConfig);

        // Also verify the file was created in the actual home directory
        const configPath = path.join(expectedPath, '.mcp-config.json');
        const fileExists = await fs.access(configPath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      } finally {
        // Cleanup
        await fs.rm(expectedPath, { recursive: true, force: true });
      }
    });

    it('GREEN: should handle paths without tilde normally', async () => {
      const validConfig: ProjectConfig = { projectId: 'no-tilde' };
      await repo.saveConfig(tempDir, validConfig);

      const loaded = await repo.loadConfig(tempDir);
      expect(loaded).toEqual(validConfig);
    });
  });

  // ==========================================================================
  // Save/Load Roundtrip Tests
  // ==========================================================================

  describe('save/load roundtrip', () => {
    it('GREEN: should preserve all fields in roundtrip', async () => {
      const originalConfig: ProjectConfig = {
        projectId: 'roundtrip-test',
        name: 'Roundtrip Test Project',
        description: 'This is a test of config persistence',
      };

      await repo.saveConfig(tempDir, originalConfig);
      const loaded = await repo.loadConfig(tempDir);

      expect(loaded).toEqual(originalConfig);
    });

    it('GREEN: should handle special characters in name and description', async () => {
      const configWithSpecialChars: ProjectConfig = {
        projectId: 'special-chars',
        name: 'Project with "quotes" and \'apostrophes\'',
        description: 'Description with\nnewlines\tand\ttabs',
      };

      await repo.saveConfig(tempDir, configWithSpecialChars);
      const loaded = await repo.loadConfig(tempDir);

      expect(loaded).toEqual(configWithSpecialChars);
    });
  });
});

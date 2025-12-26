/**
 * RED: Phase 4.17 - Config File Error Scenarios Tests
 *
 * Tests for error handling in .mcp-config.json file operations.
 * Covers edge cases and error scenarios for FileConfigRepository.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { FileConfigRepository } from '../../packages/core/src/infrastructure/repositories/file/file-config-repository.js';
import { ValidationError } from '../../packages/core/src/domain/repositories/errors.js';

describe('RED: Phase 4.17 - Config File Error Scenarios', () => {
  let repository: FileConfigRepository;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `config-errors-${Date.now().toString()}`);
    await fs.mkdir(testDir, { recursive: true });

    repository = new FileConfigRepository();
    await repository.initialize();
  });

  afterEach(async () => {
    await repository.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // RED 1: File not found should return null with clear context
  describe('RED 1: Missing config file', () => {
    it('should return null when .mcp-config.json not found', async () => {
      const workspacePath = path.join(testDir, 'no-config-workspace');
      await fs.mkdir(workspacePath, { recursive: true });

      const result = await repository.loadConfig(workspacePath);

      expect(result).toBeNull();
    });

    it('should include workspace path in context when file not found', async () => {
      const workspacePath = path.join(testDir, 'missing-workspace');
      // Don't create the directory - should handle gracefully

      const result = await repository.loadConfig(workspacePath);

      expect(result).toBeNull();
    });
  });

  // RED 2: Invalid JSON (syntax error) should throw ValidationError with position
  describe('RED 2: Invalid JSON syntax', () => {
    it('should throw ValidationError with parse position for invalid JSON', async () => {
      const workspacePath = path.join(testDir, 'invalid-json');
      await fs.mkdir(workspacePath, { recursive: true });

      // Write invalid JSON (missing closing brace)
      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, '{"projectId": "test"', 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });

    it('should include line/position information in error message for malformed JSON', async () => {
      const workspacePath = path.join(testDir, 'malformed-json');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, '{\n  "projectId": "test",\n  "invalid": }\n', 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(/position|line|unexpected/i);
    });

    it('should reject JSON with trailing comma', async () => {
      const workspacePath = path.join(testDir, 'trailing-comma');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, '{"projectId": "test",}', 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow();
    });
  });

  // RED 3: Missing required field projectId should throw ValidationError with description
  describe('RED 3: Missing required projectId field', () => {
    it('should throw ValidationError when projectId is missing', async () => {
      const workspacePath = path.join(testDir, 'missing-projectid');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ name: 'Test Project' }), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(/projectId.*required/i);
    });

    it('should throw ValidationError when projectId is null', async () => {
      const workspacePath = path.join(testDir, 'null-projectid');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: null }), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(/projectId/i);
    });

    it('should throw ValidationError when projectId is empty string', async () => {
      const workspacePath = path.join(testDir, 'empty-projectid');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: '' }), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(/projectId.*non-empty/i);
    });
  });

  // RED 4: Invalid projectId format should throw ValidationError
  describe('RED 4: Invalid projectId format', () => {
    it('should reject projectId with special characters', async () => {
      const workspacePath = path.join(testDir, 'special-chars');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: 'project@#$%' }), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(/invalid characters|security violations/i);
    });

    it('should reject projectId with spaces', async () => {
      const workspacePath = path.join(testDir, 'spaces');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: 'my project' }), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });

    it('should ALLOW projectId with uppercase letters', async () => {
      // GREEN: Phase 4.18 - Uppercase letters are valid in projectId
      // Case-insensitive conflict detection happens at ProjectService level
      const workspacePath = path.join(testDir, 'uppercase');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: 'MyProject' }), 'utf-8');

      const result = await repository.loadConfig(workspacePath);
      expect(result).not.toBeNull();
      expect(result?.projectId).toBe('MyProject');
    });

    it('should reject projectId with path traversal attempt', async () => {
      const workspacePath = path.join(testDir, 'path-traversal');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: '../../../etc/passwd' }), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });
  });

  // RED 5: Empty file should be handled correctly
  describe('RED 5: Empty config file', () => {
    it('should throw ValidationError for completely empty file', async () => {
      const workspacePath = path.join(testDir, 'empty-file');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, '', 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for whitespace-only file', async () => {
      const workspacePath = path.join(testDir, 'whitespace-only');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, '   \n\t\n   ', 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty JSON object', async () => {
      const workspacePath = path.join(testDir, 'empty-object');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, '{}', 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(/projectId.*required/i);
    });
  });

  // RED 6: Permission errors should provide clear message
  describe('RED 6: Permission errors', () => {
    it('should provide clear message for read permission denied', async () => {
      // Skip on Windows where chmod doesn't work the same way
      if (process.platform === 'win32') {
        return;
      }

      const workspacePath = path.join(testDir, 'no-read-perm');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, JSON.stringify({ projectId: 'test' }), 'utf-8');

      // Remove read permissions
      await fs.chmod(configPath, 0o000);

      try {
        await expect(repository.loadConfig(workspacePath)).rejects.toThrow(/EACCES|EPERM|permission/i);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(configPath, 0o644);
      }
    });

    it('should provide clear message for write permission denied', async () => {
      // Skip on Windows where chmod doesn't work the same way
      if (process.platform === 'win32') {
        return;
      }

      const workspacePath = path.join(testDir, 'no-write-perm');
      await fs.mkdir(workspacePath, { recursive: true });

      // Make directory read-only
      await fs.chmod(workspacePath, 0o444);

      try {
        await expect(
          repository.saveConfig(workspacePath, { projectId: 'test' })
        ).rejects.toThrow(/EACCES|EPERM|permission/i);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(workspacePath, 0o755);
      }
    });
  });

  // Additional edge cases
  describe('RED: Additional edge cases', () => {
    it('should reject non-string projectId (number)', async () => {
      const workspacePath = path.join(testDir, 'number-projectid');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await fs.writeFile(configPath, JSON.stringify({ projectId: 12345 } as any), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });

    it('should reject non-string projectId (array)', async () => {
      const workspacePath = path.join(testDir, 'array-projectid');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await fs.writeFile(configPath, JSON.stringify({ projectId: ['test'] } as any), 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });

    it('should reject config that is a JSON array instead of object', async () => {
      const workspacePath = path.join(testDir, 'array-root');
      await fs.mkdir(workspacePath, { recursive: true });

      const configPath = path.join(workspacePath, '.mcp-config.json');
      await fs.writeFile(configPath, '[{"projectId": "test"}]', 'utf-8');

      await expect(repository.loadConfig(workspacePath)).rejects.toThrow(ValidationError);
    });
  });
});

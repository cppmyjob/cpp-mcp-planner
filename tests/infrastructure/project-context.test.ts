/**
 * RED: Phase 2.2.2 - Tests for project-context.ts
 *
 * These tests verify AsyncLocalStorage-based project context:
 * - getProjectId() returns current context or fallback
 * - setFallbackProjectId() sets fallback for MCP Server
 * - runWithProjectContext() scopes context using run()
 * - Context isolation in parallel operations
 * - Async propagation through Promises/setTimeout
 * - disable() cleans up resources
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import {
  getProjectId,
  setFallbackProjectId,
  runWithProjectContext,
  disable,
} from '../../packages/core/src/context/project-context.js';

describe('ProjectContext (AsyncLocalStorage)', () => {
  afterEach(() => {
    // Clean up after each test
    disable();
  });

  describe('getProjectId() - no context', () => {
    it('should return undefined when no context is set', () => {
      const result = getProjectId();
      expect(result).toBeUndefined();
    });
  });

  describe('setFallbackProjectId() - MCP Server mode', () => {
    it('should set fallback projectId', () => {
      setFallbackProjectId('mcp-server-project');
      const result = getProjectId();
      expect(result).toBe('mcp-server-project');
    });

    it('should return fallback when no async context exists', () => {
      setFallbackProjectId('fallback-project');

      // Outside any runWithProjectContext
      expect(getProjectId()).toBe('fallback-project');
    });

    it('should prefer async context over fallback', () => {
      setFallbackProjectId('fallback-project');

      return runWithProjectContext('context-project', () => {
        expect(getProjectId()).toBe('context-project');
      });
    });
  });

  describe('runWithProjectContext() - Web Server mode', () => {
    it('should set context within callback', () => {
      return runWithProjectContext('web-project-123', () => {
        const result = getProjectId();
        expect(result).toBe('web-project-123');
      });
    });

    it('should clear context after callback completes', async () => {
      await runWithProjectContext('temp-project', () => {
        expect(getProjectId()).toBe('temp-project');
      });

      // Outside context
      expect(getProjectId()).toBeUndefined();
    });

    it('should support async callbacks', async () => {
      const result = await runWithProjectContext('async-project', async () => {
        expect(getProjectId()).toBe('async-project');

        await new Promise<void>(resolve => setTimeout(resolve, 10));

        expect(getProjectId()).toBe('async-project');

        return 'async-result';
      });

      expect(result).toBe('async-result');
    });

    it('should propagate context through Promise chains', async () => {
      await runWithProjectContext('promise-project', async () => {
        const step1 = await Promise.resolve('step1');
        expect(getProjectId()).toBe('promise-project');

        const step2 = await Promise.resolve(step1).then(val => {
          expect(getProjectId()).toBe('promise-project');
          return `${val}-step2`;
        });

        expect(step2).toBe('step1-step2');
      });
    });
  });

  describe('Nested contexts', () => {
    it('should support nested contexts (inner shadows outer)', async () => {
      await runWithProjectContext('outer-project', async () => {
        expect(getProjectId()).toBe('outer-project');

        await runWithProjectContext('inner-project', () => {
          expect(getProjectId()).toBe('inner-project');
        });

        expect(getProjectId()).toBe('outer-project');
      });
    });
  });

  describe('Parallel operations isolation', () => {
    it('should isolate contexts in parallel operations', async () => {
      const operation1 = runWithProjectContext('project-a', async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 20));
        return getProjectId();
      });

      const operation2 = runWithProjectContext('project-b', async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 10));
        return getProjectId();
      });

      const [result1, result2] = await Promise.all([operation1, operation2]);

      expect(result1).toBe('project-a');
      expect(result2).toBe('project-b');
    });

    it('should not have cross-contamination in concurrent requests', async () => {
      const results: (string | undefined)[] = [];

      const requests: Promise<string | undefined>[] = Array.from({ length: 5 }, (_, i) =>
        runWithProjectContext(`project-${String(i)}`, async () => {
          await new Promise<void>(resolve => setTimeout(resolve, Math.random() * 20));
          const projectId = getProjectId();
          results.push(projectId);
          return projectId;
        })
      );

      const projectIds = await Promise.all(requests);

      // Verify each request saw its own projectId
      projectIds.forEach((id, index) => {
        expect(id).toBe(`project-${String(index)}`);
      });

      // Verify no undefined values
      expect(results.every(r => r !== undefined)).toBe(true);
    });
  });

  describe('Helper functions and call stack', () => {
    function helperFunction(): string | undefined {
      return getProjectId();
    }

    function nestedHelper(): string | undefined {
      return helperFunction();
    }

    it('should access context from nested function calls', () => {
      return runWithProjectContext('helper-project', () => {
        expect(helperFunction()).toBe('helper-project');
        expect(nestedHelper()).toBe('helper-project');
      });
    });
  });

  describe('disable() cleanup', () => {
    it('should clear both context and fallback', () => {
      setFallbackProjectId('to-be-cleared');
      expect(getProjectId()).toBe('to-be-cleared');

      disable();

      expect(getProjectId()).toBeUndefined();
    });

    it('should clear context even inside runWithProjectContext', async () => {
      await runWithProjectContext('context-before-disable', () => {
        expect(getProjectId()).toBe('context-before-disable');

        disable();

        // After disable, even inside context should return undefined
        expect(getProjectId()).toBeUndefined();
      });
    });
  });

  describe('Error handling', () => {
    it('should propagate errors from callback', async () => {
      await expect(
        runWithProjectContext('error-project', async () => {
          await Promise.resolve(); // Satisfy require-await
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });

    it('should clear context even if callback throws', async () => {
      try {
        await runWithProjectContext('error-project', () => {
          throw new Error('Test error');
        });
      } catch {
        // Ignore error
      }

      // Context should be cleared
      expect(getProjectId()).toBeUndefined();
    });
  });
});

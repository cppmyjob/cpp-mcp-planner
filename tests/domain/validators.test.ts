import { describe, it, expect } from '@jest/globals';
import { validateTargets } from '../../src/domain/services/validators.js';

describe('validateTargets', () => {
  describe('basic validation', () => {
    it('RED: should accept empty array', () => {
      expect(() => { validateTargets([]); }).not.toThrow();
    });

    it('RED: should accept undefined', () => {
      expect(() => { validateTargets(undefined as unknown as []); }).not.toThrow();
    });

    it('RED: should accept valid target with path and action', () => {
      expect(() => { validateTargets([{ path: 'src/file.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept all valid actions', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'create' }]); }).not.toThrow();
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify' }]); }).not.toThrow();
      expect(() => { validateTargets([{ path: 'file.ts', action: 'delete' }]); }).not.toThrow();
    });

    it('RED: should reject invalid action', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'invalid' }]); })
        .toThrow(/action must be one of/);
    });

    it('RED: should reject missing path', () => {
      expect(() => { validateTargets([{ action: 'create' }]); })
        .toThrow(/path must be a non-empty string/);
    });

    it('RED: should reject empty path', () => {
      expect(() => { validateTargets([{ path: '', action: 'create' }]); })
        .toThrow(/path must be a non-empty string/);
    });

    it('RED: should reject path with only whitespace', () => {
      expect(() => { validateTargets([{ path: '   ', action: 'create' }]); })
        .toThrow(/path must be a non-empty string/);
    });
  });

  describe('line number validation', () => {
    it('RED: should accept lineNumber alone', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: 10 }]); }).not.toThrow();
    });

    it('RED: should accept lineNumber with lineEnd', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: 10, lineEnd: 20 }]); }).not.toThrow();
    });

    it('RED: should accept lineEnd equal to lineNumber (single line range)', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: 10, lineEnd: 10 }]); }).not.toThrow();
    });

    it('RED: should reject lineEnd without lineNumber', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineEnd: 20 }]); })
        .toThrow(/lineEnd requires lineNumber/);
    });

    it('RED: should reject lineEnd < lineNumber', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: 20, lineEnd: 10 }]); })
        .toThrow(/lineEnd must be >= lineNumber/);
    });

    it('RED: should reject lineNumber = 0', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: 0 }]); })
        .toThrow(/lineNumber must be a positive integer/);
    });

    it('RED: should reject negative lineNumber', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: -5 }]); })
        .toThrow(/lineNumber must be a positive integer/);
    });

    it('RED: should reject fractional lineNumber', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: 10.5 }]); })
        .toThrow(/lineNumber must be an integer/);
    });

    it('RED: should reject non-number lineNumber', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: '10' as unknown as number }]); })
        .toThrow(/lineNumber must be a number/);
    });
  });

  describe('search pattern validation', () => {
    it('RED: should accept valid regex pattern', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: 'function.*test' }]); }).not.toThrow();
    });

    it('RED: should accept simple string pattern', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: 'TODO' }]); }).not.toThrow();
    });

    it('RED: should reject empty searchPattern', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: '' }]); })
        .toThrow(/searchPattern must be a non-empty string/);
    });

    it('RED: should reject invalid regex (unclosed group)', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: 'function(' }]); })
        .toThrow(/invalid regex in searchPattern/);
    });

    it('RED: should reject invalid regex (unclosed bracket)', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: '[abc' }]); })
        .toThrow(/invalid regex in searchPattern/);
    });

    it('RED: should reject invalid regex (quantifier at start)', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: '*test' }]); })
        .toThrow(/invalid regex in searchPattern/);
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: '+test' }]); })
        .toThrow(/invalid regex in searchPattern/);
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', searchPattern: '?test' }]); })
        .toThrow(/invalid regex in searchPattern/);
    });

    it('RED: should reject lineNumber + searchPattern conflict', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'modify', lineNumber: 10, searchPattern: 'test' }]); })
        .toThrow(/cannot use both lineNumber and searchPattern/);
    });
  });

  describe('path validation', () => {
    it('RED: should accept Unix paths', () => {
      expect(() => { validateTargets([{ path: 'src/services/user.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept Windows paths', () => {
      expect(() => { validateTargets([{ path: 'src\\services\\user.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept absolute Unix paths', () => {
      expect(() => { validateTargets([{ path: '/home/user/project/file.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept absolute Windows paths', () => {
      expect(() => { validateTargets([{ path: 'C:\\Projects\\file.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept paths with spaces', () => {
      expect(() => { validateTargets([{ path: 'My Documents/file.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept paths with unicode', () => {
      expect(() => { validateTargets([{ path: 'src/файл.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept paths with parent directory references', () => {
      expect(() => { validateTargets([{ path: '../file.ts', action: 'create' }]); }).not.toThrow();
      expect(() => { validateTargets([{ path: '../../parent/file.ts', action: 'create' }]); }).not.toThrow();
    });
  });

  describe('multiple targets validation', () => {
    it('RED: should accept multiple targets', () => {
      expect(() => { validateTargets([
        { path: 'file1.ts', action: 'create' },
        { path: 'file2.ts', action: 'modify' },
        { path: 'file3.ts', action: 'delete' },
      ]); }).not.toThrow();
    });

    it('RED: should allow duplicate paths (same file, different operations)', () => {
      // This is valid: create then modify in same artifact
      expect(() => { validateTargets([
        { path: 'file.ts', action: 'create' },
        { path: 'file.ts', action: 'modify', lineNumber: 10 },
      ]); }).not.toThrow();
    });
  });

  describe('description validation', () => {
    it('RED: should accept description', () => {
      expect(() => { validateTargets([{ path: 'file.ts', action: 'create', description: 'Create user service' }]); }).not.toThrow();
    });

    it('RED: should accept empty description string', () => {
      // Empty string is different from undefined - both are valid
      expect(() => { validateTargets([{ path: 'file.ts', action: 'create', description: '' }]); }).not.toThrow();
    });
  });
});

import { describe, it, expect } from '@jest/globals';
import { validateTargets, validateSlug } from '../../src/domain/services/validators.js';

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

    it('RED: should reject absolute Unix paths (BUG-030 security fix)', () => {
      expect(() => { validateTargets([{ path: '/home/user/project/file.ts', action: 'create' }]); }).toThrow('must be a relative path');
    });

    it('RED: should reject absolute Windows paths (BUG-030 security fix)', () => {
      expect(() => { validateTargets([{ path: 'C:\\Projects\\file.ts', action: 'create' }]); }).toThrow('must be a relative path');
    });

    it('RED: should accept paths with spaces', () => {
      expect(() => { validateTargets([{ path: 'My Documents/file.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should accept paths with unicode', () => {
      expect(() => { validateTargets([{ path: 'src/файл.ts', action: 'create' }]); }).not.toThrow();
    });

    it('RED: should reject paths with parent directory references (BUG-030 security fix)', () => {
      expect(() => { validateTargets([{ path: '../file.ts', action: 'create' }]); }).toThrow('path traversal');
      expect(() => { validateTargets([{ path: '../../parent/file.ts', action: 'create' }]); }).toThrow('path traversal');
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

describe('validateSlug', () => {
  describe('valid slugs', () => {
    it('RED: should accept valid lowercase alphanumeric slug with dashes', () => {
      expect(() => { validateSlug('my-valid-slug-123'); }).not.toThrow();
    });

    it('RED: should accept simple lowercase slug', () => {
      expect(() => { validateSlug('myslug'); }).not.toThrow();
    });

    it('RED: should accept slug with numbers only', () => {
      expect(() => { validateSlug('123'); }).not.toThrow();
    });

    it('RED: should accept single character slug', () => {
      expect(() => { validateSlug('a'); }).not.toThrow();
    });

    it('RED: should skip validation for undefined (optional field)', () => {
      expect(() => { validateSlug(undefined); }).not.toThrow();
    });
  });

  describe('invalid characters', () => {
    it('RED: should reject spaces in slug', () => {
      expect(() => { validateSlug('my slug'); })
        .toThrow(/must be lowercase alphanumeric with dashes/i);
    });

    it('RED: should reject uppercase letters', () => {
      expect(() => { validateSlug('MySlug'); })
        .toThrow(/must be lowercase alphanumeric with dashes/i);
    });

    it('RED: should reject special characters @', () => {
      expect(() => { validateSlug('my@slug'); })
        .toThrow(/must be lowercase alphanumeric with dashes/i);
    });

    it('RED: should reject special characters !', () => {
      expect(() => { validateSlug('my-slug!'); })
        .toThrow(/must be lowercase alphanumeric with dashes/i);
    });

    it('RED: should reject underscores', () => {
      expect(() => { validateSlug('my_slug'); })
        .toThrow(/must be lowercase alphanumeric with dashes/i);
    });
  });

  describe('dash position validation', () => {
    it('RED: should reject leading dash', () => {
      expect(() => { validateSlug('-myslug'); })
        .toThrow(/cannot start or end with a dash/i);
    });

    it('RED: should reject trailing dash', () => {
      expect(() => { validateSlug('myslug-'); })
        .toThrow(/cannot start or end with a dash/i);
    });

    it('RED: should reject consecutive dashes', () => {
      expect(() => { validateSlug('my--slug'); })
        .toThrow(/cannot contain consecutive dashes/i);
    });

    it('RED: should reject multiple consecutive dashes', () => {
      expect(() => { validateSlug('my---slug'); })
        .toThrow(/cannot contain consecutive dashes/i);
    });
  });

  describe('length validation', () => {
    it('RED: should reject empty string', () => {
      expect(() => { validateSlug(''); })
        .toThrow(/must be a non-empty string/i);
    });

    it('RED: should reject slug exceeding max length (100)', () => {
      const longSlug = 'a'.repeat(101);
      expect(() => { validateSlug(longSlug); })
        .toThrow(/must not exceed 100 characters/i);
    });

    it('RED: should accept slug at max length (100)', () => {
      const maxSlug = 'a'.repeat(100);
      expect(() => { validateSlug(maxSlug); }).not.toThrow();
    });
  });
});

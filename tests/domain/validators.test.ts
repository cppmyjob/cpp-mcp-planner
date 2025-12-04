import { describe, it, expect } from '@jest/globals';
import {
  validateEffortEstimate,
  validateAlternativesConsidered,
  validateTags,
  validateCodeExamples,
  validateArtifactType,
  validateFileTable,
  validatePriority,
  validateCodeRefs,
} from '../../src/domain/services/validators.js';

describe('Validators', () => {
  describe('validateCodeExamples', () => {
    it('should accept valid code examples', () => {
      expect(() =>
        validateCodeExamples([
          { language: 'typescript', code: 'const x = 1;' },
          { language: 'javascript', code: 'let y = 2;', filename: 'test.js' },
          { language: 'python', code: 'x = 1', description: 'Simple assignment' },
        ])
      ).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => validateCodeExamples([])).not.toThrow();
    });

    it('should skip validation if not an array', () => {
      expect(() => validateCodeExamples(null as any)).not.toThrow();
      expect(() => validateCodeExamples(undefined as any)).not.toThrow();
    });

    it('should throw if language is missing', () => {
      expect(() =>
        validateCodeExamples([{ code: 'const x = 1;' } as any])
      ).toThrow(/language/i);
    });

    it('should throw if language is empty string', () => {
      expect(() =>
        validateCodeExamples([{ language: '', code: 'const x = 1;' }])
      ).toThrow(/language/i);
    });

    it('should throw if language is not a string', () => {
      expect(() =>
        validateCodeExamples([{ language: 123, code: 'const x = 1;' } as any])
      ).toThrow(/language/i);
    });

    it('should throw if code is missing', () => {
      expect(() =>
        validateCodeExamples([{ language: 'typescript' } as any])
      ).toThrow(/code/i);
    });

    it('should throw if code is not a string', () => {
      expect(() =>
        validateCodeExamples([{ language: 'typescript', code: 123 } as any])
      ).toThrow(/code/i);
    });

    it('should accept code as empty string', () => {
      expect(() =>
        validateCodeExamples([{ language: 'typescript', code: '' }])
      ).not.toThrow();
    });

    it('should report correct index in error message', () => {
      expect(() =>
        validateCodeExamples([
          { language: 'typescript', code: 'ok' },
          { language: 'python', code: 'ok' },
          { language: '', code: 'bad' },
        ])
      ).toThrow(/index 2/i);
    });

    it('should accept optional filename and description', () => {
      expect(() =>
        validateCodeExamples([
          {
            language: 'typescript',
            code: 'export class MyService {}',
            filename: 'my-service.ts',
            description: 'Service implementation',
          },
        ])
      ).not.toThrow();
    });
  });

  // Existing validators - basic sanity tests
  describe('validateEffortEstimate', () => {
    it('should accept valid effort estimate', () => {
      expect(() =>
        validateEffortEstimate({ value: 5, unit: 'days', confidence: 'medium' })
      ).not.toThrow();
    });

    it('should skip undefined/null', () => {
      expect(() => validateEffortEstimate(undefined)).not.toThrow();
      expect(() => validateEffortEstimate(null)).not.toThrow();
    });

    it('should accept minutes as valid unit', () => {
      expect(() =>
        validateEffortEstimate({ value: 30, unit: 'minutes', confidence: 'high' })
      ).not.toThrow();
    });

    it('should accept all valid units', () => {
      const validUnits = ['minutes', 'hours', 'days', 'weeks', 'story-points'];
      for (const unit of validUnits) {
        expect(() =>
          validateEffortEstimate({ value: 1, unit, confidence: 'medium' })
        ).not.toThrow();
      }
    });

    it('should throw for invalid unit', () => {
      expect(() =>
        validateEffortEstimate({ value: 1, unit: 'seconds', confidence: 'high' })
      ).toThrow(/unit.*must be one of/);
    });
  });

  describe('validateAlternativesConsidered', () => {
    it('should accept valid alternatives', () => {
      expect(() =>
        validateAlternativesConsidered([
          { option: 'Option A', reasoning: 'Because...' },
        ])
      ).not.toThrow();
    });
  });

  describe('validateTags', () => {
    it('should accept valid tags', () => {
      expect(() =>
        validateTags([{ key: 'priority', value: 'high' }])
      ).not.toThrow();
    });
  });

  describe('validateArtifactType', () => {
    it('should accept valid artifact types', () => {
      const validTypes = ['code', 'config', 'migration', 'documentation', 'test', 'script', 'other'];
      for (const type of validTypes) {
        expect(() => validateArtifactType(type)).not.toThrow();
      }
    });

    it('should throw for invalid artifact type', () => {
      expect(() => validateArtifactType('invalid')).toThrow(/artifactType/i);
      expect(() => validateArtifactType('')).toThrow(/artifactType/i);
      expect(() => validateArtifactType(123)).toThrow(/artifactType/i);
    });
  });

  describe('validateFileTable', () => {
    it('should accept valid file table entries', () => {
      expect(() =>
        validateFileTable([
          { path: 'src/file.ts', action: 'create' },
          { path: 'src/other.ts', action: 'modify', description: 'Update imports' },
          { path: 'old/file.ts', action: 'delete' },
        ])
      ).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => validateFileTable([])).not.toThrow();
    });

    it('should skip validation if not an array', () => {
      expect(() => validateFileTable(null as any)).not.toThrow();
      expect(() => validateFileTable(undefined as any)).not.toThrow();
    });

    it('should throw if path is missing', () => {
      expect(() =>
        validateFileTable([{ action: 'create' } as any])
      ).toThrow(/path/i);
    });

    it('should throw if path is empty', () => {
      expect(() =>
        validateFileTable([{ path: '', action: 'create' }])
      ).toThrow(/path/i);
    });

    it('should throw if action is invalid', () => {
      expect(() =>
        validateFileTable([{ path: 'src/file.ts', action: 'invalid' }])
      ).toThrow(/action/i);
    });

    it('should report correct index in error message', () => {
      expect(() =>
        validateFileTable([
          { path: 'ok.ts', action: 'create' },
          { path: '', action: 'modify' },
        ])
      ).toThrow(/index 1/i);
    });
  });

  describe('validatePriority', () => {
    it('should accept undefined (optional field)', () => {
      expect(() => validatePriority(undefined)).not.toThrow();
    });

    it('should accept null (optional field)', () => {
      expect(() => validatePriority(null)).not.toThrow();
    });

    it('should accept all valid priority values', () => {
      const validPriorities = ['critical', 'high', 'medium', 'low'];
      for (const priority of validPriorities) {
        expect(() => validatePriority(priority)).not.toThrow();
      }
    });

    it('should reject empty string', () => {
      expect(() => validatePriority('')).toThrow(/Invalid priority/);
    });

    it('should reject invalid priority value', () => {
      expect(() => validatePriority('urgent')).toThrow(/Invalid priority/);
      expect(() => validatePriority('urgent')).toThrow(/critical, high, medium, low/);
    });

    it('should reject wrong case (case-sensitive)', () => {
      expect(() => validatePriority('CRITICAL')).toThrow(/Invalid priority/);
      expect(() => validatePriority('High')).toThrow(/Invalid priority/);
    });

    it('should reject non-string types', () => {
      expect(() => validatePriority(1)).toThrow(/must be a string/);
      expect(() => validatePriority({ value: 'high' })).toThrow(/must be a string/);
    });
  });

  describe('validateCodeRefs', () => {
    it('should accept valid code references', () => {
      expect(() =>
        validateCodeRefs([
          'src/file.ts:42',
          'src/services/phase-service.ts:100',
          'tests/unit/test.ts:1',
        ])
      ).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => validateCodeRefs([])).not.toThrow();
    });

    it('should skip validation if not an array', () => {
      expect(() => validateCodeRefs(null as any)).not.toThrow();
      expect(() => validateCodeRefs(undefined as any)).not.toThrow();
    });

    it('should throw if entry is not a string', () => {
      expect(() =>
        validateCodeRefs([123 as any])
      ).toThrow(/must be a string/);
    });

    it('should throw if entry is empty string', () => {
      expect(() =>
        validateCodeRefs([''])
      ).toThrow(/cannot be empty/);
    });

    it('should throw if entry does not contain colon with line number', () => {
      expect(() =>
        validateCodeRefs(['src/file.ts'])
      ).toThrow(/must be in format/);
    });

    it('should throw if line number is not a positive integer', () => {
      expect(() =>
        validateCodeRefs(['src/file.ts:0'])
      ).toThrow(/line number must be a positive integer/);

      expect(() =>
        validateCodeRefs(['src/file.ts:-1'])
      ).toThrow(/line number must be a positive integer/);

      expect(() =>
        validateCodeRefs(['src/file.ts:abc'])
      ).toThrow(/line number must be a positive integer/);

      expect(() =>
        validateCodeRefs(['src/file.ts:1.5'])
      ).toThrow(/line number must be a positive integer/);
    });

    it('should report correct index in error message', () => {
      expect(() =>
        validateCodeRefs([
          'src/valid.ts:10',
          'src/another.ts:20',
          'invalid-no-line',
        ])
      ).toThrow(/index 2/i);
    });

    it('should accept Windows-style paths', () => {
      expect(() =>
        validateCodeRefs([
          'D:\\Projects\\file.ts:42',
          'C:\\Users\\name\\code.ts:100',
        ])
      ).not.toThrow();
    });

    it('should accept paths with spaces', () => {
      expect(() =>
        validateCodeRefs([
          'src/my file.ts:42',
          'path with spaces/code.ts:10',
        ])
      ).not.toThrow();
    });

    it('should accept colons in Windows drive letters', () => {
      // Windows paths like D:\path\file.ts:42 have two colons
      expect(() =>
        validateCodeRefs(['D:\\path\\file.ts:42'])
      ).not.toThrow();
    });

    it('should handle multiple colons - take last as line number', () => {
      // Edge case: file path might have colon in URL-like paths
      expect(() =>
        validateCodeRefs(['http://example.com/path:42'])
      ).not.toThrow();
    });
  });
});

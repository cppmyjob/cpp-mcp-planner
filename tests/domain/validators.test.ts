import { describe, it, expect } from '@jest/globals';
import {
  validateEffortEstimate,
  validateAlternativesConsidered,
  validateTags,
  validateCodeExamples,
  validateArtifactType,
  validateFileTable,
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
});

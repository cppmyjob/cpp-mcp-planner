import { describe, it, expect } from '@jest/globals';
import type {
  Entity,
  Requirement,
  Solution,
  Decision,
  Phase,
  Artifact,
  ArtifactTarget,
  Link,
  PlanManifest,
  Tag,
  EntityType,
  RelationType,
} from '../../src/domain/entities/types.js';

describe('Entity Types', () => {
  describe('Tag', () => {
    it('should have key and value', () => {
      const tag: Tag = { key: 'priority', value: 'high' };
      expect(tag.key).toBe('priority');
      expect(tag.value).toBe('high');
    });
  });

  describe('EntityType', () => {
    it('should support all entity types', () => {
      const types: EntityType[] = ['requirement', 'solution', 'decision', 'phase'];
      expect(types).toHaveLength(4);
    });
  });

  describe('Requirement', () => {
    it('should have all required fields', () => {
      const requirement: Requirement = {
        id: 'req-001',
        type: 'requirement',
        createdAt: '2024-12-01T10:00:00Z',
        updatedAt: '2024-12-01T10:00:00Z',
        version: 1,
        metadata: {
          createdBy: 'claude-code',
          tags: [{ key: 'feature', value: 'auth' }],
          annotations: [],
        },
        title: 'User Authentication',
        description: 'Users can login with email/password',
        source: { type: 'user-request' },
        acceptanceCriteria: ['Login works', 'JWT returned'],
        priority: 'critical',
        category: 'functional',
        status: 'draft',
      };

      expect(requirement.type).toBe('requirement');
      expect(requirement.priority).toBe('critical');
      expect(requirement.acceptanceCriteria).toHaveLength(2);
    });

    it('should support optional fields', () => {
      const requirement: Requirement = {
        id: 'req-002',
        type: 'requirement',
        createdAt: '2024-12-01T10:00:00Z',
        updatedAt: '2024-12-01T10:00:00Z',
        version: 1,
        metadata: { createdBy: 'claude-code', tags: [], annotations: [] },
        title: 'Performance',
        description: 'API response < 200ms',
        rationale: 'User experience',
        source: { type: 'derived', parentId: 'req-001' },
        acceptanceCriteria: ['Response time measured'],
        priority: 'high',
        category: 'non-functional',
        status: 'approved',
        impact: {
          scope: ['api', 'database'],
          complexityEstimate: 7,
          riskLevel: 'medium',
        },
      };

      expect(requirement.rationale).toBe('User experience');
      expect(requirement.impact?.riskLevel).toBe('medium');
    });
  });

  describe('Solution', () => {
    it('should have tradeoffs', () => {
      const solution: Solution = {
        id: 'sol-001',
        type: 'solution',
        createdAt: '2024-12-01T10:00:00Z',
        updatedAt: '2024-12-01T10:00:00Z',
        version: 1,
        metadata: { createdBy: 'claude-code', tags: [], annotations: [] },
        title: 'Use jsonwebtoken',
        description: 'JWT library for auth',
        approach: 'Install and configure jwt',
        tradeoffs: [
          {
            aspect: 'Security',
            pros: ['Battle-tested'],
            cons: ['Additional dependency'],
            score: 8,
          },
        ],
        addressing: ['req-001'],
        evaluation: {
          effortEstimate: { value: 4, unit: 'hours', confidence: 'high' },
          technicalFeasibility: 'high',
          riskAssessment: 'Low risk',
        },
        status: 'proposed',
      };

      expect(solution.tradeoffs).toHaveLength(1);
      expect(solution.tradeoffs[0].score).toBe(8);
    });
  });

  describe('Phase', () => {
    it('should support hierarchy', () => {
      const phase: Phase = {
        id: 'phase-001',
        type: 'phase',
        createdAt: '2024-12-01T10:00:00Z',
        updatedAt: '2024-12-01T10:00:00Z',
        version: 1,
        metadata: { createdBy: 'claude-code', tags: [], annotations: [] },
        title: 'Core Implementation',
        description: 'Build core features',
        parentId: null,
        order: 1,
        depth: 0,
        path: '1',
        objectives: ['Build auth'],
        deliverables: ['Login API'],
        successCriteria: ['Tests pass'],
        schedule: {
          estimatedEffort: { value: 2, unit: 'days', confidence: 'medium' },
        },
        status: 'planned',
        progress: 0,
      };

      expect(phase.depth).toBe(0);
      expect(phase.path).toBe('1');
      expect(phase.parentId).toBeNull();
    });

    it('should track status and progress', () => {
      const phase: Phase = {
        id: 'phase-002',
        type: 'phase',
        createdAt: '2024-12-01T10:00:00Z',
        updatedAt: '2024-12-01T12:00:00Z',
        version: 2,
        metadata: { createdBy: 'claude-code', tags: [], annotations: [] },
        title: 'Login Implementation',
        description: 'Implement login endpoint',
        parentId: 'phase-001',
        order: 1,
        depth: 1,
        path: '1.1',
        objectives: ['Login endpoint'],
        deliverables: ['POST /api/auth/login'],
        successCriteria: ['Unit tests pass'],
        schedule: {
          estimatedEffort: { value: 4, unit: 'hours', confidence: 'high' },
          actualEffort: 3.5,
        },
        status: 'completed',
        progress: 100,
        startedAt: '2024-12-01T10:00:00Z',
        completedAt: '2024-12-01T12:00:00Z',
      };

      expect(phase.status).toBe('completed');
      expect(phase.progress).toBe(100);
      expect(phase.schedule.actualEffort).toBe(3.5);
    });

    it('should have optional priority field', () => {
      const phase: Phase = {
        id: 'phase-003',
        type: 'phase',
        createdAt: '2024-12-01T10:00:00Z',
        updatedAt: '2024-12-01T10:00:00Z',
        version: 1,
        metadata: { createdBy: 'claude-code', tags: [], annotations: [] },
        title: 'High Priority Phase',
        description: 'Critical work',
        parentId: null,
        order: 1,
        depth: 0,
        path: '1',
        objectives: ['Build auth'],
        deliverables: ['Login API'],
        successCriteria: ['Tests pass'],
        schedule: {
          estimatedEffort: { value: 2, unit: 'days', confidence: 'medium' },
        },
        status: 'planned',
        progress: 0,
        priority: 'critical',
      };

      expect(phase.priority).toBe('critical');
    });

    it('should allow phase without priority field', () => {
      const phase: Partial<Phase> = {
        title: 'No Priority',
        priority: undefined,
      };
      expect(phase.priority).toBeUndefined();
    });
  });

  describe('Link', () => {
    it('should support all relation types', () => {
      const relations: RelationType[] = [
        'implements',
        'addresses',
        'depends_on',
        'blocks',
        'alternative_to',
        'supersedes',
        'references',
        'derived_from',
      ];
      expect(relations).toHaveLength(8);
    });

    it('should have required fields', () => {
      const link: Link = {
        id: 'link-001',
        sourceId: 'sol-001',
        targetId: 'req-001',
        relationType: 'implements',
        createdAt: '2024-12-01T10:00:00Z',
        createdBy: 'claude-code',
      };

      expect(link.relationType).toBe('implements');
    });
  });

  describe('PlanManifest', () => {
    it('should have statistics', () => {
      const manifest: PlanManifest = {
        id: 'plan-001',
        name: 'Auth Implementation',
        description: 'Implement user authentication',
        status: 'active',
        author: 'claude-code',
        createdAt: '2024-12-01T10:00:00Z',
        updatedAt: '2024-12-01T10:00:00Z',
        version: 1,
        lockVersion: 1,
        statistics: {
          totalRequirements: 5,
          totalSolutions: 3,
          totalDecisions: 2,
          totalPhases: 4,
          totalArtifacts: 0,
          completionPercentage: 25,
        },
      };

      expect(manifest.statistics.totalRequirements).toBe(5);
      expect(manifest.lockVersion).toBe(1);
    });
  });

  describe('ArtifactTarget interface', () => {
    it('RED: should have required path field', () => {
      const target: ArtifactTarget = { path: 'src/file.ts', action: 'create' };
      expect(target.path).toBe('src/file.ts');
    });

    it('RED: should have required action field', () => {
      const target: ArtifactTarget = { path: 'src/file.ts', action: 'modify' };
      expect(target.action).toBe('modify');
    });

    it('RED: should accept all valid actions', () => {
      const create: ArtifactTarget = { path: 'f.ts', action: 'create' };
      const modify: ArtifactTarget = { path: 'f.ts', action: 'modify' };
      const del: ArtifactTarget = { path: 'f.ts', action: 'delete' };
      expect([create.action, modify.action, del.action]).toEqual(['create', 'modify', 'delete']);
    });

    it('RED: should allow optional lineNumber', () => {
      const target: ArtifactTarget = { path: 'src/file.ts', action: 'modify', lineNumber: 10 };
      expect(target.lineNumber).toBe(10);
    });

    it('RED: should allow optional lineEnd', () => {
      const target: ArtifactTarget = { path: 'src/file.ts', action: 'modify', lineNumber: 10, lineEnd: 20 };
      expect(target.lineEnd).toBe(20);
    });

    it('RED: should allow optional searchPattern', () => {
      const target: ArtifactTarget = { path: 'src/file.ts', action: 'modify', searchPattern: 'function.*test' };
      expect(target.searchPattern).toBe('function.*test');
    });

    it('RED: should allow optional description', () => {
      const target: ArtifactTarget = { path: 'src/file.ts', action: 'create', description: 'New file' };
      expect(target.description).toBe('New file');
    });
  });

  describe('Artifact interface with targets', () => {
    it('RED: should have targets field instead of fileTable', () => {
      const artifact: Artifact = {
        id: '1', type: 'artifact', title: 'Test', description: 'Test',
        artifactType: 'code', status: 'draft', content: {},
        targets: [{ path: 'file.ts', action: 'create' }],
        createdAt: '', updatedAt: '', version: 1,
        metadata: { createdBy: '', tags: [], annotations: [] }
      };
      expect(artifact.targets).toBeDefined();
      expect(artifact.targets).toHaveLength(1);
    });

    it('RED: should allow undefined targets (optional field)', () => {
      const artifact: Artifact = {
        id: '1', type: 'artifact', title: 'Test', description: 'Test',
        artifactType: 'code', status: 'draft', content: {},
        createdAt: '', updatedAt: '', version: 1,
        metadata: { createdBy: '', tags: [], annotations: [] }
      };
      expect(artifact.targets).toBeUndefined();
    });
  });
});

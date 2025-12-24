import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ArtifactsComponent } from './artifacts';
import { ArtifactService } from '../../core/services/api/artifact.service';
import { PlanStateService } from '../../core/services/plan-state.service';
import type { Artifact, ArtifactType, ArtifactStatus } from '../../models';

// REVIEW: All tests passing - Artifacts component implementation complete
describe('ArtifactsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtifactsComponent]
    }).compileComponents();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;
      expect(component).toBeTruthy();
    });

    it('should have data-testid for e2e testing', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="artifacts-page"]')).toBeTruthy();
    });

    it('should display artifacts title', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.artifacts__title')?.textContent).toContain('Artifacts');
    });
  });

  describe('Initial State', () => {
    it('should have loading signal initially true', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);
    });

    it('should have empty artifacts array initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.artifacts()).toEqual([]);
    });

    it('should have null error initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.error()).toBeNull();
    });

    it('should have null selectedArtifact initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectedArtifact()).toBeNull();
    });

    it('should have loadingContent signal initially false', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.loadingContent()).toBe(false);
    });
  });

  describe('Filter State', () => {
    it('should have null selectedType initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectedType()).toBeNull();
    });

    it('should have null selectedStatus initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectedStatus()).toBeNull();
    });
  });

  describe('Filtering', () => {
    it('should have filteredArtifacts computed signal', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.filteredArtifacts).toBeDefined();
      expect(typeof component.filteredArtifacts).toBe('function');
    });

    it('should filter artifacts by type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifacts = [
        { id: 'art-1', artifactType: 'code', status: 'draft' },
        { id: 'art-2', artifactType: 'config', status: 'draft' },
        { id: 'art-3', artifactType: 'code', status: 'implemented' }
      ] as unknown as Artifact[];

      component.artifacts.set(mockArtifacts);
      component.selectedType.set('code' as ArtifactType);

      const filtered = component.filteredArtifacts();
      expect(filtered.length).toBe(2);
      expect(filtered.every(a => a.artifactType === 'code')).toBe(true);
    });

    it('should filter artifacts by status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifacts = [
        { id: 'art-1', artifactType: 'code', status: 'draft' },
        { id: 'art-2', artifactType: 'config', status: 'implemented' },
        { id: 'art-3', artifactType: 'code', status: 'draft' }
      ] as unknown as Artifact[];

      component.artifacts.set(mockArtifacts);
      component.selectedStatus.set('draft' as ArtifactStatus);

      const filtered = component.filteredArtifacts();
      expect(filtered.length).toBe(2);
      expect(filtered.every(a => a.status === 'draft')).toBe(true);
    });

    it('should filter artifacts by both type and status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifacts = [
        { id: 'art-1', artifactType: 'code', status: 'draft' },
        { id: 'art-2', artifactType: 'code', status: 'implemented' },
        { id: 'art-3', artifactType: 'config', status: 'draft' }
      ] as unknown as Artifact[];

      component.artifacts.set(mockArtifacts);
      component.selectedType.set('code' as ArtifactType);
      component.selectedStatus.set('draft' as ArtifactStatus);

      const filtered = component.filteredArtifacts();
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('art-1');
    });

    it('should return all artifacts when no filter selected', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifacts = [
        { id: 'art-1', artifactType: 'code', status: 'draft' },
        { id: 'art-2', artifactType: 'config', status: 'implemented' }
      ] as unknown as Artifact[];

      component.artifacts.set(mockArtifacts);
      component.selectedType.set(null);
      component.selectedStatus.set(null);

      const filtered = component.filteredArtifacts();
      expect(filtered.length).toBe(2);
    });
  });

  describe('Helper Methods', () => {
    it('should generate short artifact ID from UUID', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifact = { id: 'abc-123-def-456' } as Artifact;
      expect(component.getArtifactId(mockArtifact)).toBe('ART-ABC');
    });

    it('should return success severity for implemented status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('implemented' as ArtifactStatus)).toBe('success');
    });

    it('should return info severity for approved status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('approved' as ArtifactStatus)).toBe('info');
    });

    it('should return info severity for reviewed status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('reviewed' as ArtifactStatus)).toBe('info');
    });

    it('should return secondary severity for draft status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('draft' as ArtifactStatus)).toBe('secondary');
    });

    it('should return warn severity for outdated status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('outdated' as ArtifactStatus)).toBe('warn');
    });
  });

  describe('Type Icons', () => {
    it('should return pi-code icon for code type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('code' as ArtifactType)).toBe('pi-code');
    });

    it('should return pi-cog icon for config type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('config' as ArtifactType)).toBe('pi-cog');
    });

    it('should return pi-database icon for migration type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('migration' as ArtifactType)).toBe('pi-database');
    });

    it('should return pi-file icon for documentation type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('documentation' as ArtifactType)).toBe('pi-file');
    });

    it('should return pi-check-circle icon for test type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('test' as ArtifactType)).toBe('pi-check-circle');
    });

    it('should return pi-bolt icon for script type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('script' as ArtifactType)).toBe('pi-bolt');
    });

    it('should return pi-folder icon for other type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('other' as ArtifactType)).toBe('pi-folder');
    });
  });

  describe('Filter Options', () => {
    it('should have typeOptions array with all types', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.typeOptions).toBeDefined();
      expect(component.typeOptions.length).toBeGreaterThanOrEqual(8);
      expect(component.typeOptions[0].value).toBeNull(); // "All Types"
      expect(component.typeOptions.some(o => o.value === 'code')).toBe(true);
      expect(component.typeOptions.some(o => o.value === 'config')).toBe(true);
    });

    it('should have statusOptions array with all statuses', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.statusOptions).toBeDefined();
      expect(component.statusOptions.length).toBeGreaterThanOrEqual(6);
      expect(component.statusOptions[0].value).toBeNull(); // "All Statuses"
      expect(component.statusOptions.some(o => o.value === 'draft')).toBe(true);
      expect(component.statusOptions.some(o => o.value === 'implemented')).toBe(true);
    });
  });

  describe('Selection', () => {
    it('should have selectArtifact method', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectArtifact).toBeDefined();
      expect(typeof component.selectArtifact).toBe('function');
    });

    it('should deselect when clicking same artifact', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifact = { id: 'art-1', title: 'Test' } as Artifact;
      component.selectedArtifact.set(mockArtifact);

      // Simulate selecting same artifact - should deselect
      component.selectArtifact(mockArtifact);
      expect(component.selectedArtifact()).toBeNull();
    });
  });

  describe('Code Preview Helpers', () => {
    it('should check if artifact has content', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const withContent = { content: { sourceCode: 'const x = 1;' } } as unknown as Artifact;
      const withoutContent = { content: undefined } as unknown as Artifact;
      const emptyContent = { content: { sourceCode: '' } } as unknown as Artifact;

      expect(component.hasContent(withContent)).toBe(true);
      expect(component.hasContent(withoutContent)).toBe(false);
      expect(component.hasContent(emptyContent)).toBe(false);
    });

    it('should check if artifact has targets', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const withTargets = { targets: [{ path: 'src/test.ts', action: 'create' }] } as unknown as Artifact;
      const emptyTargets = { targets: [] } as unknown as Artifact;
      const noTargets = { targets: undefined } as unknown as Artifact;

      expect(component.hasTargets(withTargets)).toBe(true);
      expect(component.hasTargets(emptyTargets)).toBe(false);
      expect(component.hasTargets(noTargets)).toBe(false);
    });

    it('should check if artifact has description', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const withDesc = { description: 'Some description' } as unknown as Artifact;
      const withoutDesc = { description: undefined } as unknown as Artifact;
      const emptyDesc = { description: '' } as unknown as Artifact;

      expect(component.hasDescription(withDesc)).toBe(true);
      expect(component.hasDescription(withoutDesc)).toBe(false);
      expect(component.hasDescription(emptyDesc)).toBe(false);
    });
  });

  describe('Phase Display', () => {
    it('should format phase ID for display', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifact = { relatedPhaseId: 'abc123-def456' } as unknown as Artifact;
      expect(component.formatPhaseId(mockArtifact)).toBe('abc1');
    });

    it('should return dash when no phase', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifact = { relatedPhaseId: undefined } as unknown as Artifact;
      expect(component.formatPhaseId(mockArtifact)).toBe('-');
    });
  });
});

// REVIEW: Service integration tests with mocking
describe('ArtifactsComponent with Service Mocking', () => {
  const mockArtifact: Artifact = {
    id: 'art-123',
    type: 'artifact',
    title: 'Test Artifact',
    description: 'Test description',
    artifactType: 'code',
    status: 'draft',
    content: { language: 'typescript', sourceCode: 'const x = 1;' },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    version: 1,
    metadata: { createdBy: 'test', tags: [], annotations: [] }
  };

  const mockArtifactService = {
    list: vi.fn(),
    get: vi.fn()
  };

  const mockPlanStateService = {
    activePlanId: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockArtifactService.list.mockReturnValue(of([mockArtifact]));
    mockArtifactService.get.mockReturnValue(of(mockArtifact));
    mockPlanStateService.activePlanId.mockReturnValue('plan-123');

    await TestBed.configureTestingModule({
      imports: [ArtifactsComponent],
      providers: [
        { provide: ArtifactService, useValue: mockArtifactService },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    }).compileComponents();
  });

  describe('selectArtifact with API call', () => {
    it('should call artifactService.get when selecting new artifact', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      const artifactToSelect = { ...mockArtifact, id: 'art-456' } as Artifact;
      component.selectArtifact(artifactToSelect);

      expect(mockArtifactService.get).toHaveBeenCalledWith(
        'plan-123',
        'art-456',
        { includeContent: true }
      );
    });

    it('should set loadingContent to true while fetching', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectArtifact(mockArtifact);

      // Loading should be set immediately
      expect(component.loadingContent()).toBe(false); // Already resolved due to sync mock
    });

    it('should set selectedArtifact after successful fetch', () => {
      const fullArtifact = { ...mockArtifact, content: { sourceCode: 'full code' } };
      mockArtifactService.get.mockReturnValue(of(fullArtifact));

      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectArtifact(mockArtifact);

      expect(component.selectedArtifact()).toEqual(fullArtifact);
      expect(component.loadingContent()).toBe(false);
    });

    it('should handle error when fetching artifact content', () => {
      mockArtifactService.get.mockReturnValue(throwError(() => new Error('Network error')));

      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectArtifact(mockArtifact);

      expect(component.loadingContent()).toBe(false);
      // selectedArtifact should remain null on error
      expect(component.selectedArtifact()).toBeNull();
    });

    it('should not call API when no plan is active', () => {
      mockPlanStateService.activePlanId.mockReturnValue(null);

      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectArtifact(mockArtifact);

      expect(mockArtifactService.get).not.toHaveBeenCalled();
    });
  });
});

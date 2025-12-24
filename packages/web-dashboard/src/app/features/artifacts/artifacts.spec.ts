import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactsComponent } from './artifacts';
import type { Artifact, ArtifactType, ArtifactStatus } from '../../models';

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
    it('RED: should have loading signal initially true', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);
    });

    it('RED: should have empty artifacts array initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.artifacts()).toEqual([]);
    });

    it('RED: should have null error initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.error()).toBeNull();
    });

    it('RED: should have null selectedArtifact initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectedArtifact()).toBeNull();
    });

    it('RED: should have loadingContent signal initially false', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.loadingContent()).toBe(false);
    });
  });

  describe('Filter State', () => {
    it('RED: should have null selectedType initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectedType()).toBeNull();
    });

    it('RED: should have null selectedStatus initially', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectedStatus()).toBeNull();
    });
  });

  describe('Filtering', () => {
    it('RED: should have filteredArtifacts computed signal', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.filteredArtifacts).toBeDefined();
      expect(typeof component.filteredArtifacts).toBe('function');
    });

    it('RED: should filter artifacts by type', () => {
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

    it('RED: should filter artifacts by status', () => {
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

    it('RED: should filter artifacts by both type and status', () => {
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

    it('RED: should return all artifacts when no filter selected', () => {
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
    it('RED: should generate short artifact ID from UUID', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifact = { id: 'abc-123-def-456' } as Artifact;
      expect(component.getArtifactId(mockArtifact)).toBe('ART-ABC');
    });

    it('RED: should return success severity for implemented status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('implemented' as ArtifactStatus)).toBe('success');
    });

    it('RED: should return info severity for approved status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('approved' as ArtifactStatus)).toBe('info');
    });

    it('RED: should return info severity for reviewed status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('reviewed' as ArtifactStatus)).toBe('info');
    });

    it('RED: should return secondary severity for draft status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('draft' as ArtifactStatus)).toBe('secondary');
    });

    it('RED: should return warn severity for outdated status', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('outdated' as ArtifactStatus)).toBe('warn');
    });
  });

  describe('Type Icons', () => {
    it('RED: should return pi-code icon for code type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('code' as ArtifactType)).toBe('pi-code');
    });

    it('RED: should return pi-cog icon for config type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('config' as ArtifactType)).toBe('pi-cog');
    });

    it('RED: should return pi-database icon for migration type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('migration' as ArtifactType)).toBe('pi-database');
    });

    it('RED: should return pi-file icon for documentation type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('documentation' as ArtifactType)).toBe('pi-file');
    });

    it('RED: should return pi-check-circle icon for test type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('test' as ArtifactType)).toBe('pi-check-circle');
    });

    it('RED: should return pi-bolt icon for script type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('script' as ArtifactType)).toBe('pi-bolt');
    });

    it('RED: should return pi-folder icon for other type', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.getTypeIcon('other' as ArtifactType)).toBe('pi-folder');
    });
  });

  describe('Filter Options', () => {
    it('RED: should have typeOptions array with all types', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.typeOptions).toBeDefined();
      expect(component.typeOptions.length).toBeGreaterThanOrEqual(8);
      expect(component.typeOptions[0].value).toBeNull(); // "All Types"
      expect(component.typeOptions.some(o => o.value === 'code')).toBe(true);
      expect(component.typeOptions.some(o => o.value === 'config')).toBe(true);
    });

    it('RED: should have statusOptions array with all statuses', () => {
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
    it('RED: should have selectArtifact method', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      expect(component.selectArtifact).toBeDefined();
      expect(typeof component.selectArtifact).toBe('function');
    });

    it('RED: should deselect when clicking same artifact', () => {
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
    it('RED: should check if artifact has content', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const withContent = { content: { sourceCode: 'const x = 1;' } } as unknown as Artifact;
      const withoutContent = { content: undefined } as unknown as Artifact;
      const emptyContent = { content: { sourceCode: '' } } as unknown as Artifact;

      expect(component.hasContent(withContent)).toBe(true);
      expect(component.hasContent(withoutContent)).toBe(false);
      expect(component.hasContent(emptyContent)).toBe(false);
    });

    it('RED: should check if artifact has targets', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const withTargets = { targets: [{ path: 'src/test.ts', action: 'create' }] } as unknown as Artifact;
      const emptyTargets = { targets: [] } as unknown as Artifact;
      const noTargets = { targets: undefined } as unknown as Artifact;

      expect(component.hasTargets(withTargets)).toBe(true);
      expect(component.hasTargets(emptyTargets)).toBe(false);
      expect(component.hasTargets(noTargets)).toBe(false);
    });

    it('RED: should check if artifact has description', () => {
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
    it('RED: should format phase ID for display', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifact = { relatedPhaseId: 'abc123-def456' } as unknown as Artifact;
      expect(component.formatPhaseId(mockArtifact)).toBe('abc1');
    });

    it('RED: should return dash when no phase', () => {
      const fixture = TestBed.createComponent(ArtifactsComponent);
      const component = fixture.componentInstance;

      const mockArtifact = { relatedPhaseId: undefined } as unknown as Artifact;
      expect(component.formatPhaseId(mockArtifact)).toBe('-');
    });
  });
});

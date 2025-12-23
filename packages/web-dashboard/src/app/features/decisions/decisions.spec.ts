import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { DecisionsComponent } from './decisions';
import type { Decision, DecisionStatus } from '../../models';

describe('DecisionsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionsComponent]
    }).compileComponents();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;
      expect(component).toBeTruthy();
    });

    it('should have data-testid for e2e testing', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="decisions-page"]')).toBeTruthy();
    });

    it('should display decisions title', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.decisions__title')?.textContent).toContain('Decisions');
    });
  });

  describe('Initial State', () => {
    it('should have loading signal initially true', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);
    });

    it('should have empty decisions array initially', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.decisions()).toEqual([]);
    });

    it('should have null error initially', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.error()).toBeNull();
    });
  });

  describe('Timeline Data', () => {
    it('GREEN: should have sortedDecisions computed signal', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.sortedDecisions).toBeDefined();
      expect(typeof component.sortedDecisions).toBe('function');
    });

    it('GREEN: should sort decisions by createdAt descending (newest first)', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions: Partial<Decision>[] = [
        { id: 'dec-1', status: 'active', createdAt: '2025-01-10T10:00:00Z' },
        { id: 'dec-3', status: 'active', createdAt: '2025-01-20T10:00:00Z' },
        { id: 'dec-2', status: 'active', createdAt: '2025-01-15T10:00:00Z' }
      ];
      component.decisions.set(mockDecisions as Decision[]);

      const sorted = component.sortedDecisions();
      expect(sorted[0].id).toBe('dec-3'); // newest
      expect(sorted[1].id).toBe('dec-2');
      expect(sorted[2].id).toBe('dec-1'); // oldest
    });

    it('GREEN: should format date for timeline display', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecision = { createdAt: '2025-01-15T10:30:00Z' } as Decision;
      const formatted = component.formatDate(mockDecision.createdAt);

      expect(formatted).toBeTruthy();
      expect(formatted).toContain('Jan');
      expect(formatted).toContain('2025');
    });
  });

  describe('Helper Methods', () => {
    it('should generate short decision ID from UUID', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecision = { id: 'abc-123-def-456' } as Parameters<typeof component.getDecId>[0];
      expect(component.getDecId(mockDecision)).toBe('DEC-ABC');
    });

    it('should return success severity for active status', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('active' as DecisionStatus)).toBe('success');
    });

    it('should return warn severity for superseded status', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('superseded' as DecisionStatus)).toBe('warn');
    });

    it('should return danger severity for reversed status', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('reversed' as DecisionStatus)).toBe('danger');
    });
  });

  describe('Card Display Helpers', () => {
    it('GREEN: should check if decision has context', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const withContext = { context: 'Some context' } as unknown as Decision;
      const withoutContext = { context: undefined } as unknown as Decision;
      const emptyContext = { context: '' } as unknown as Decision;

      expect(component.hasContext(withContext)).toBe(true);
      expect(component.hasContext(withoutContext)).toBe(false);
      expect(component.hasContext(emptyContext)).toBe(false);
    });

    it('GREEN: should check if decision has consequences', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const withConsequences = { consequences: 'Some consequences' } as unknown as Decision;
      const withoutConsequences = { consequences: undefined } as unknown as Decision;

      expect(component.hasConsequences(withConsequences)).toBe(true);
      expect(component.hasConsequences(withoutConsequences)).toBe(false);
    });

    it('GREEN: should check if decision has impact scope', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const withScope = { impactScope: ['api', 'auth'] } as unknown as Decision;
      const emptyScope = { impactScope: [] } as unknown as Decision;
      const noScope = { impactScope: undefined } as unknown as Decision;

      expect(component.hasImpactScope(withScope)).toBe(true);
      expect(component.hasImpactScope(emptyScope)).toBe(false);
      expect(component.hasImpactScope(noScope)).toBe(false);
    });

    it('GREEN: should check if decision has alternatives considered', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const withAlts = { alternativesConsidered: [{ option: 'A', reasoning: 'reason' }] } as unknown as Decision;
      const emptyAlts = { alternativesConsidered: [] } as unknown as Decision;
      const noAlts = { alternativesConsidered: undefined } as unknown as Decision;

      expect(component.hasAlternatives(withAlts)).toBe(true);
      expect(component.hasAlternatives(emptyAlts)).toBe(false);
      expect(component.hasAlternatives(noAlts)).toBe(false);
    });
  });

  describe('Supersession Chain', () => {
    it('GREEN: should check if decision is superseded', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const superseded = { supersededBy: 'new-dec-id' } as unknown as Decision;
      const notSuperseded = { supersededBy: undefined } as unknown as Decision;

      expect(component.isSuperseded(superseded)).toBe(true);
      expect(component.isSuperseded(notSuperseded)).toBe(false);
    });

    it('GREEN: should check if decision supersedes another', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const supersedes = { supersedes: 'old-dec-id' } as unknown as Decision;
      const doesNotSupersede = { supersedes: undefined } as unknown as Decision;

      expect(component.doesSupersede(supersedes)).toBe(true);
      expect(component.doesSupersede(doesNotSupersede)).toBe(false);
    });

    it('GREEN: should find decision by id', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions = [
        { id: 'dec-1', title: 'First' },
        { id: 'dec-2', title: 'Second' },
        { id: 'dec-3', title: 'Third' }
      ] as unknown as Decision[];
      component.decisions.set(mockDecisions);

      expect(component.findDecisionById('dec-2')?.title).toBe('Second');
      expect(component.findDecisionById('non-existent')).toBeUndefined();
    });

    it('GREEN: should get superseding decision title', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions = [
        { id: 'old-dec', title: 'Old Decision', supersededBy: 'new-dec' },
        { id: 'new-dec', title: 'New Decision', supersedes: 'old-dec' }
      ] as unknown as Decision[];
      component.decisions.set(mockDecisions);

      const oldDecision = mockDecisions[0];
      expect(component.getSupersedingDecisionTitle(oldDecision)).toBe('New Decision');
    });

    it('GREEN: should get superseded decision title', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions = [
        { id: 'old-dec', title: 'Old Decision', supersededBy: 'new-dec' },
        { id: 'new-dec', title: 'New Decision', supersedes: 'old-dec' }
      ] as unknown as Decision[];
      component.decisions.set(mockDecisions);

      const newDecision = mockDecisions[1];
      expect(component.getSupersededDecisionTitle(newDecision)).toBe('Old Decision');
    });
  });

  describe('Status Filter', () => {
    it('GREEN: should initialize with all statuses selected', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      expect(component.selectedStatuses()).toEqual(['active', 'superseded', 'reversed']);
    });

    it('GREEN: should filter decisions by selected statuses', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions = [
        { id: 'dec-1', status: 'active', createdAt: new Date('2024-01-01').toISOString() },
        { id: 'dec-2', status: 'superseded', createdAt: new Date('2024-01-02').toISOString() },
        { id: 'dec-3', status: 'reversed', createdAt: new Date('2024-01-03').toISOString() },
        { id: 'dec-4', status: 'active', createdAt: new Date('2024-01-04').toISOString() }
      ] as unknown as Decision[];

      component.decisions.set(mockDecisions);
      component.selectedStatuses.set(['active']);

      const filtered = component.filteredDecisions();
      expect(filtered.length).toBe(2);
      expect(filtered.every(d => d.status === 'active')).toBe(true);
    });

    it('GREEN: should return all decisions when all statuses selected', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions = [
        { id: 'dec-1', status: 'active', createdAt: new Date('2024-01-01').toISOString() },
        { id: 'dec-2', status: 'superseded', createdAt: new Date('2024-01-02').toISOString() },
        { id: 'dec-3', status: 'reversed', createdAt: new Date('2024-01-03').toISOString() }
      ] as unknown as Decision[];

      component.decisions.set(mockDecisions);
      component.selectedStatuses.set(['active', 'superseded', 'reversed']);

      const filtered = component.filteredDecisions();
      expect(filtered.length).toBe(3);
    });

    it('GREEN: should return empty array when no statuses selected', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions = [
        { id: 'dec-1', status: 'active', createdAt: new Date('2024-01-01').toISOString() }
      ] as unknown as Decision[];

      component.decisions.set(mockDecisions);
      component.selectedStatuses.set([]);

      const filtered = component.filteredDecisions();
      expect(filtered.length).toBe(0);
    });

    it('GREEN: should filter multiple statuses', () => {
      const fixture = TestBed.createComponent(DecisionsComponent);
      const component = fixture.componentInstance;

      const mockDecisions = [
        { id: 'dec-1', status: 'active', createdAt: new Date('2024-01-01').toISOString() },
        { id: 'dec-2', status: 'superseded', createdAt: new Date('2024-01-02').toISOString() },
        { id: 'dec-3', status: 'reversed', createdAt: new Date('2024-01-03').toISOString() }
      ] as unknown as Decision[];

      component.decisions.set(mockDecisions);
      component.selectedStatuses.set(['active', 'superseded']);

      const filtered = component.filteredDecisions();
      expect(filtered.length).toBe(2);
      expect(filtered.find(d => d.status === 'reversed')).toBeUndefined();
    });
  });
});

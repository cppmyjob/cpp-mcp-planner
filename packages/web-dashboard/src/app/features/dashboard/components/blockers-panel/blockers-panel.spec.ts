import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { BlockersPanelComponent } from './blockers-panel';
import { PhaseService, PlanStateService } from '../../../../core/services';
import type { Phase } from '../../../../models';

describe('BlockersPanelComponent', () => {
  const mockBlockedPhases: Phase[] = [
    {
      id: 'phase-1',
      type: 'phase',
      title: 'Blocked Phase 1',
      description: 'Description 1',
      parentId: null,
      order: 1,
      depth: 0,
      path: '1',
      objectives: [],
      deliverables: [],
      successCriteria: [],
      schedule: { estimatedEffort: { value: 1, unit: 'weeks', confidence: 'medium' } },
      status: 'blocked',
      priority: 'critical',
      progress: 25,
      blockingReason: 'Waiting for API',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      version: 1,
      metadata: { createdBy: 'test', tags: [], annotations: [] }
    } as Phase,
    {
      id: 'phase-2',
      type: 'phase',
      title: 'Blocked Phase 2',
      description: 'Description 2',
      parentId: null,
      order: 2,
      depth: 0,
      path: '2',
      objectives: [],
      deliverables: [],
      successCriteria: [],
      schedule: { estimatedEffort: { value: 2, unit: 'days', confidence: 'high' } },
      status: 'blocked',
      priority: 'high',
      progress: 10,
      blockingReason: 'Dependency issue',
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      version: 1,
      metadata: { createdBy: 'test', tags: [], annotations: [] }
    } as Phase
  ];

  const mockPhaseService = {
    list: vi.fn(() => of(mockBlockedPhases))
  };

  const activePlanIdSignal = signal('plan-1');
  const mockPlanStateService = {
    activePlanId: activePlanIdSignal.asReadonly()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    activePlanIdSignal.set('plan-1');
    mockPhaseService.list.mockReturnValue(of(mockBlockedPhases));

    await TestBed.configureTestingModule({
      imports: [BlockersPanelComponent],
      providers: [
        { provide: PhaseService, useValue: mockPhaseService },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    }).compileComponents();
  });

  describe('initialization', () => {
    it('should create', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('should initialize with empty blockedPhases array', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.blockedPhases()).toEqual([]);
    });

    it('should initialize with loading true', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);
    });

    it('should initialize with null error', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.error()).toBeNull();
    });
  });

  describe('successful data loading', () => {
    it('should load blocked phases on init', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      fixture.detectChanges();

      expect(mockPhaseService.list).toHaveBeenCalledWith('plan-1', {
        status: 'blocked',
        fields: ['title', 'blockingReason', 'path', 'priority']
      });
      expect(fixture.componentInstance.blockedPhases()).toEqual(mockBlockedPhases);
    });

    it('should set loading to false after successful load', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);

      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('should clear error after successful load', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      // Simulate previous error
      component.error.set('Previous error');
      expect(component.error()).toBe('Previous error');

      fixture.detectChanges();

      expect(component.error()).toBeNull();
    });

    it('should reload blocked phases when activePlanId changes', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      fixture.detectChanges();

      expect(mockPhaseService.list).toHaveBeenCalledTimes(1);

      // Change active plan
      activePlanIdSignal.set('plan-2');
      TestBed.flushEffects();
      fixture.detectChanges();

      // Should reload with new planId
      expect(mockPhaseService.list).toHaveBeenCalledTimes(2);
      expect(mockPhaseService.list).toHaveBeenCalledWith('plan-2', {
        status: 'blocked',
        fields: ['title', 'blockingReason', 'path', 'priority']
      });
    });
  });

  describe('error handling', () => {
    it('should set error when list fails', () => {
      const errorMessage = 'Failed to fetch blocked phases';
      mockPhaseService.list.mockReturnValue(throwError(() => ({ message: errorMessage })));

      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.error()).toBe(errorMessage);
    });

    it('should set default error message when error has no message', () => {
      mockPhaseService.list.mockReturnValue(throwError(() => ({})));

      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.error()).toBe('Failed to load blocked phases');
    });

    it('should set loading to false after error', () => {
      mockPhaseService.list.mockReturnValue(throwError(() => ({ message: 'Error' })));

      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);

      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('should keep blockedPhases empty when load fails', () => {
      mockPhaseService.list.mockReturnValue(throwError(() => ({ message: 'Error' })));

      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.blockedPhases()).toEqual([]);
    });
  });

  describe('getPrioritySeverity', () => {
    it('should return danger for critical priority', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.getPrioritySeverity('critical')).toBe('danger');
    });

    it('should return warn for high priority', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.getPrioritySeverity('high')).toBe('warn');
    });

    it('should return info for medium priority', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.getPrioritySeverity('medium')).toBe('info');
    });

    it('should return success for low priority', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.getPrioritySeverity('low')).toBe('success');
    });

    it('should return info for undefined priority', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.getPrioritySeverity(undefined)).toBe('info');
    });

    it('should return info for unknown priority', () => {
      const fixture = TestBed.createComponent(BlockersPanelComponent);
      const component = fixture.componentInstance;

      expect(component.getPrioritySeverity('unknown')).toBe('info');
    });
  });
});

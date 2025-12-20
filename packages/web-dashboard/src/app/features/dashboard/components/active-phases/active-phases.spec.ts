import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ActivePhasesComponent } from './active-phases';
import { PhaseService, PlanStateService } from '../../../../core/services';
import type { Phase } from '../../../../models';

describe('ActivePhasesComponent', () => {
  const mockPhases: Phase[] = [
    {
      id: 'phase-1',
      type: 'phase',
      title: 'Active Phase 1',
      description: 'Description 1',
      parentId: null,
      order: 1,
      depth: 0,
      path: '1',
      objectives: [],
      deliverables: [],
      successCriteria: [],
      schedule: { estimatedEffort: { value: 1, unit: 'weeks', confidence: 'medium' } },
      status: 'in_progress',
      priority: 'high',
      progress: 50,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      version: 1,
      metadata: { createdBy: 'test', tags: [], annotations: [] }
    } as Phase,
    {
      id: 'phase-2',
      type: 'phase',
      title: 'Active Phase 2',
      description: 'Description 2',
      parentId: null,
      order: 2,
      depth: 0,
      path: '2',
      objectives: [],
      deliverables: [],
      successCriteria: [],
      schedule: { estimatedEffort: { value: 2, unit: 'weeks', confidence: 'high' } },
      status: 'in_progress',
      priority: 'medium',
      progress: 30,
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      version: 1,
      metadata: { createdBy: 'test', tags: [], annotations: [] }
    } as Phase
  ];

  const mockPhaseService = {
    list: vi.fn(() => of(mockPhases))
  };

  const activePlanIdSignal = signal('plan-1');
  const mockPlanStateService = {
    activePlanId: activePlanIdSignal.asReadonly()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    activePlanIdSignal.set('plan-1');

    await TestBed.configureTestingModule({
      imports: [ActivePhasesComponent],
      providers: [
        { provide: PhaseService, useValue: mockPhaseService },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ActivePhasesComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should load active phases on init', () => {
    const fixture = TestBed.createComponent(ActivePhasesComponent);
    fixture.detectChanges();

    expect(mockPhaseService.list).toHaveBeenCalledWith('plan-1', {
      status: 'in_progress',
      fields: ['title', 'progress', 'priority', 'status', 'path']
    });
    expect(fixture.componentInstance.phases()).toEqual(mockPhases);
  });

  it('should reload phases when activePlanId changes', () => {
    const fixture = TestBed.createComponent(ActivePhasesComponent);
    fixture.detectChanges();

    expect(mockPhaseService.list).toHaveBeenCalledTimes(1);

    // Change active plan
    activePlanIdSignal.set('plan-2');
    TestBed.flushEffects();
    fixture.detectChanges();

    // Should reload with new planId
    expect(mockPhaseService.list).toHaveBeenCalledTimes(2);
    expect(mockPhaseService.list).toHaveBeenCalledWith('plan-2', {
      status: 'in_progress',
      fields: ['title', 'progress', 'priority', 'status', 'path']
    });
  });
});

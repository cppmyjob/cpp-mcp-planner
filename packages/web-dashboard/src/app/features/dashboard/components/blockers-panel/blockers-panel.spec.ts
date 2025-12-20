import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
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

    await TestBed.configureTestingModule({
      imports: [BlockersPanelComponent],
      providers: [
        { provide: PhaseService, useValue: mockPhaseService },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(BlockersPanelComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should load blocked phases on init', () => {
    const fixture = TestBed.createComponent(BlockersPanelComponent);
    fixture.detectChanges();

    expect(mockPhaseService.list).toHaveBeenCalledWith('plan-1', {
      status: 'blocked',
      fields: ['title', 'blockingReason', 'path', 'priority']
    });
    expect(fixture.componentInstance.blockedPhases()).toEqual(mockBlockedPhases);
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

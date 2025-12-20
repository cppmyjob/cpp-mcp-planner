import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { StatisticsCardsComponent } from './statistics-cards';
import { PlanService, PlanStateService } from '../../../../core/services';

describe('StatisticsCardsComponent', () => {
  const mockSummary = {
    statistics: {
      totalRequirements: 10,
      totalPhases: 5,
      completedPhases: 2,
      totalDecisions: 3,
      totalSolutions: 4,
      totalArtifacts: 6,
      completionPercentage: 40
    }
  };

  const mockPlanService = {
    getSummary: vi.fn(() => of(mockSummary))
  };

  const activePlanIdSignal = signal('plan-1');
  const mockPlanStateService = {
    activePlanId: activePlanIdSignal.asReadonly()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    activePlanIdSignal.set('plan-1');

    await TestBed.configureTestingModule({
      imports: [StatisticsCardsComponent],
      providers: [
        { provide: PlanService, useValue: mockPlanService },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(StatisticsCardsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should load statistics on init', () => {
    const fixture = TestBed.createComponent(StatisticsCardsComponent);
    fixture.detectChanges();

    expect(mockPlanService.getSummary).toHaveBeenCalledWith('plan-1');
    expect(fixture.componentInstance.statistics()).toEqual(mockSummary.statistics);
  });

  it('should reload statistics when activePlanId changes', () => {
    const fixture = TestBed.createComponent(StatisticsCardsComponent);
    fixture.detectChanges();

    expect(mockPlanService.getSummary).toHaveBeenCalledTimes(1);

    // Change active plan
    activePlanIdSignal.set('plan-2');
    TestBed.flushEffects();
    fixture.detectChanges();

    // Should reload with new planId
    expect(mockPlanService.getSummary).toHaveBeenCalledTimes(2);
    expect(mockPlanService.getSummary).toHaveBeenCalledWith('plan-2');
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
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
    mockPlanService.getSummary.mockReturnValue(of(mockSummary));

    await TestBed.configureTestingModule({
      imports: [StatisticsCardsComponent],
      providers: [
        { provide: PlanService, useValue: mockPlanService },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    }).compileComponents();
  });

  describe('initialization', () => {
    it('should create', () => {
      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('should initialize with null statistics', () => {
      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;

      expect(component.statistics()).toBeNull();
    });

    it('should initialize with loading true', () => {
      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);
    });

    it('should initialize with null error', () => {
      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;

      expect(component.error()).toBeNull();
    });
  });

  describe('successful data loading', () => {
    it('should load statistics on init', () => {
      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      fixture.detectChanges();

      expect(mockPlanService.getSummary).toHaveBeenCalledWith('plan-1');
      expect(fixture.componentInstance.statistics()).toEqual(mockSummary.statistics);
    });

    it('should set loading to false after successful load', () => {
      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);

      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('should clear error after successful load', () => {
      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;

      // Simulate previous error
      component.error.set('Previous error');
      expect(component.error()).toBe('Previous error');

      fixture.detectChanges();

      expect(component.error()).toBeNull();
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

  describe('error handling', () => {
    it('should set error when getSummary fails', () => {
      const errorMessage = 'Failed to fetch statistics';
      mockPlanService.getSummary.mockReturnValue(throwError(() => ({ message: errorMessage })));

      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.error()).toBe(errorMessage);
    });

    it('should set default error message when error has no message', () => {
      mockPlanService.getSummary.mockReturnValue(throwError(() => ({})));

      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.error()).toBe('Failed to load statistics');
    });

    it('should set loading to false after error', () => {
      mockPlanService.getSummary.mockReturnValue(throwError(() => ({ message: 'Error' })));

      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);

      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('should keep statistics null when load fails', () => {
      mockPlanService.getSummary.mockReturnValue(throwError(() => ({ message: 'Error' })));

      const fixture = TestBed.createComponent(StatisticsCardsComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.statistics()).toBeNull();
    });
  });
});

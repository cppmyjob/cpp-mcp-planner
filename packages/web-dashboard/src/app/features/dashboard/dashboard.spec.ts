import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';

import { DashboardComponent } from './dashboard';
import { PlanService, RequirementService, PhaseService, PlanStateService, ThemeService } from '../../core/services';

describe('DashboardComponent', () => {
  const mockPlanService = {
    getSummary: vi.fn(() => of({
      statistics: {
        totalRequirements: 10,
        totalSolutions: 5,
        totalDecisions: 3,
        totalPhases: 20,
        totalArtifacts: 8,
        completionPercentage: 45
      }
    }))
  };

  const mockRequirementService = {
    list: vi.fn(() => of([
      { id: 'req-1', title: 'Requirement 1', status: 'approved' },
      { id: 'req-2', title: 'Requirement 2', status: 'draft' }
    ]))
  };

  const mockPhaseService = {
    list: vi.fn(() => of([
      { id: 'phase-1', title: 'Phase 1', status: 'in_progress', progress: 50, path: '1.1' }
    ]))
  };

  const mockPlanStateService = {
    activePlanId: vi.fn(() => 'test-plan-id')
  };

  const mockThemeService = {
    currentTheme: signal<'light' | 'dark'>('light')
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: PlanService, useValue: mockPlanService },
        { provide: RequirementService, useValue: mockRequirementService },
        { provide: PhaseService, useValue: mockPhaseService },
        { provide: PlanStateService, useValue: mockPlanStateService },
        { provide: ThemeService, useValue: mockThemeService }
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display dashboard title', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.dashboard__title')?.textContent).toContain('Dashboard');
  });

  it('should have data-testid for e2e testing', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="dashboard-page"]')).toBeTruthy();
  });

  it('should call services on init', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(mockPlanStateService.activePlanId).toHaveBeenCalled();
    expect(mockPlanService.getSummary).toHaveBeenCalledWith('test-plan-id');
    expect(mockRequirementService.list).toHaveBeenCalledWith('test-plan-id');
    expect(mockPhaseService.list).toHaveBeenCalled();
  });
});

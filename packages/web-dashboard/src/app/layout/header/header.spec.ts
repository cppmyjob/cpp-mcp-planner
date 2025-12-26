import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';
import { HeaderComponent } from './header';
import { PlanService, PlanStateService, ProjectService, ProjectStateService } from '../../core/services';
import type { PlanManifest, ProjectInfo } from '../../models';

// Mock window.matchMedia for ThemeService
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

describe('HeaderComponent', () => {
  const mockProjects: ProjectInfo[] = [
    {
      id: 'test-project',
      name: 'Test Project',
      path: '/test/path',
      plansCount: 2,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z'
    }
  ];

  const mockPlans: PlanManifest[] = [
    {
      id: 'plan-1',
      projectId: 'test-project',
      name: 'Test Plan 1',
      description: 'Description 1',
      status: 'active',
      author: 'test-author',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      version: 1,
      lockVersion: 1,
      statistics: {
        totalRequirements: 5,
        totalSolutions: 3,
        totalDecisions: 2,
        totalPhases: 10,
        totalArtifacts: 4,
        completionPercentage: 50
      }
    },
    {
      id: 'plan-2',
      projectId: 'test-project',
      name: 'Test Plan 2',
      description: 'Description 2',
      status: 'active',
      author: 'test-author',
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      version: 1,
      lockVersion: 1,
      statistics: {
        totalRequirements: 8,
        totalSolutions: 5,
        totalDecisions: 3,
        totalPhases: 15,
        totalArtifacts: 6,
        completionPercentage: 75
      }
    }
  ];

  const mockProjectService = {
    list: vi.fn(() => of(mockProjects))
  };

  const mockPlanService = {
    list: vi.fn(() => of(mockPlans))
  };

  const activeProjectIdSignal = signal('test-project');
  const mockProjectStateService = {
    activeProjectId: activeProjectIdSignal.asReadonly(),
    setActiveProject: vi.fn((projectId: string) => {
      activeProjectIdSignal.set(projectId);
    }),
    clearActiveProject: vi.fn(),
    hasActiveProject: vi.fn(() => true)
  };

  const activePlanIdSignal = signal('plan-1');
  const mockPlanStateService = {
    activePlanId: activePlanIdSignal.asReadonly(),
    setActivePlan: vi.fn((planId: string) => {
      activePlanIdSignal.set(planId);
    }),
    clearActivePlan: vi.fn(),
    hasActivePlan: vi.fn(() => true)
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    activeProjectIdSignal.set('test-project');
    activePlanIdSignal.set('plan-1');

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        { provide: ProjectService, useValue: mockProjectService },
        { provide: ProjectStateService, useValue: mockProjectStateService },
        { provide: PlanService, useValue: mockPlanService },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display application title', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.header__title')?.textContent).toContain('MCP Planning Dashboard');
  });

  it('should have theme toggle button', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const themeButton = compiled.querySelector('[data-testid="theme-toggle"]');
    expect(themeButton).toBeTruthy();
  });

  it('should toggle theme on button click', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const initialTheme = component.isDarkTheme;

    // Click toggle - need to find button inside p-button wrapper
    const themeButton = fixture.nativeElement.querySelector('[data-testid="theme-toggle"] button');
    themeButton?.click();
    fixture.detectChanges();

    expect(component.isDarkTheme).toBe(!initialTheme);
  });

  it('should have sidebar toggle button', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const sidebarToggle = compiled.querySelector('[data-testid="sidebar-toggle"]');
    expect(sidebarToggle).toBeTruthy();
  });

  it('should emit sidebarToggle event when sidebar button clicked', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const spy = vi.spyOn(component.sidebarToggle, 'emit');

    // Click button inside p-button wrapper
    const sidebarButton = fixture.nativeElement.querySelector('[data-testid="sidebar-toggle"] button');
    sidebarButton?.click();

    expect(spy).toHaveBeenCalled();
  });

  // RED: Plan Selector Tests - These should fail until implementation
  describe('Plan Selector', () => {
    it('RED: should load plans on init', () => {
      const fixture = TestBed.createComponent(HeaderComponent);
      const component = fixture.componentInstance;

      fixture.detectChanges();

      expect(mockPlanService.list).toHaveBeenCalled();
      expect(component.plans()).toEqual(mockPlans);
      expect(component.loadingPlans()).toBe(false);
    });

    it('RED: should display plan selector dropdown in header', () => {
      const fixture = TestBed.createComponent(HeaderComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const planSelector = compiled.querySelector('[data-testid="plan-selector"]');
      expect(planSelector).toBeTruthy();
    });

    it('RED: should sync selectedPlanId with PlanStateService on init', () => {
      const fixture = TestBed.createComponent(HeaderComponent);
      const component = fixture.componentInstance;

      fixture.detectChanges();

      // activePlanId is a signal, so we just check the value
      expect(component.selectedPlanId()).toBe('plan-1');
    });

    it('RED: should call planState.setActivePlan() when plan selected', () => {
      const fixture = TestBed.createComponent(HeaderComponent);
      const component = fixture.componentInstance;

      fixture.detectChanges();

      // Simulate plan selection
      component.onPlanChange('plan-2');
      TestBed.flushEffects();
      fixture.detectChanges();

      expect(mockPlanStateService.setActivePlan).toHaveBeenCalledWith('plan-2');
      expect(component.selectedPlanId()).toBe('plan-2');
    });

    it('RED: should handle loading state when fetching plans', () => {
      const fixture = TestBed.createComponent(HeaderComponent);
      const component = fixture.componentInstance;

      fixture.detectChanges(); // Trigger ngOnInit

      // After plans loaded, loading should be false
      expect(component.loadingPlans()).toBe(false);
      expect(component.plans().length).toBeGreaterThan(0);
    });

    it('RED: should handle error state when plan loading fails', () => {
      mockPlanService.list.mockReturnValueOnce(throwError(() => new Error('API Error')));

      const fixture = TestBed.createComponent(HeaderComponent);
      const component = fixture.componentInstance;

      fixture.detectChanges();

      expect(component.loadingPlans()).toBe(false);
      expect(component.plans()).toEqual([]);
    });

    it('RED: should display selected plan name in dropdown', () => {
      const fixture = TestBed.createComponent(HeaderComponent);
      const component = fixture.componentInstance;

      fixture.detectChanges();

      // Set selected plan
      component.selectedPlanId.set('plan-1');
      fixture.detectChanges();

      // Verify selectedPlanId is set correctly
      expect(component.selectedPlanId()).toBe('plan-1');

      // Verify plan selector element exists
      const compiled = fixture.nativeElement as HTMLElement;
      const planSelector = compiled.querySelector('[data-testid="plan-selector"]');
      expect(planSelector).toBeTruthy();
    });

    it('should sync selectedPlanId when activePlanId changes externally', () => {
      const fixture = TestBed.createComponent(HeaderComponent);
      const component = fixture.componentInstance;

      fixture.detectChanges();

      expect(component.selectedPlanId()).toBe('plan-1');

      // Change activePlanId externally (not through onPlanChange)
      activePlanIdSignal.set('plan-2');
      TestBed.flushEffects();
      fixture.detectChanges();

      // selectedPlanId should sync automatically via effect
      expect(component.selectedPlanId()).toBe('plan-2');
    });
  });
});

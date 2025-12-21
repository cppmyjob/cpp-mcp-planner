import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';

import { RequirementsChartComponent } from './requirements-chart';
import { RequirementService, PlanStateService, ThemeService } from '../../../../core/services';

describe('RequirementsChartComponent', () => {
  const mockRequirements = [
    { id: 'req-1', title: 'Requirement 1', status: 'approved' },
    { id: 'req-2', title: 'Requirement 2', status: 'draft' },
    { id: 'req-3', title: 'Requirement 3', status: 'implemented' }
  ];

  const mockRequirementService = {
    list: vi.fn(() => of(mockRequirements))
  };

  const activePlanIdSignal = signal('test-plan-id');
  const mockPlanStateService = {
    activePlanId: activePlanIdSignal.asReadonly()
  };

  // Mock ThemeService with signal
  const themeSignal = signal<'light' | 'dark'>('light');
  const mockThemeService = {
    currentTheme: themeSignal
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    activePlanIdSignal.set('test-plan-id');
    themeSignal.set('light');
    mockRequirementService.list.mockReturnValue(of(mockRequirements));

    await TestBed.configureTestingModule({
      imports: [RequirementsChartComponent],
      providers: [
        { provide: RequirementService, useValue: mockRequirementService },
        { provide: PlanStateService, useValue: mockPlanStateService },
        { provide: ThemeService, useValue: mockThemeService }
      ]
    }).compileComponents();
  });

  describe('initialization', () => {
    it('should create', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;
      expect(component).toBeTruthy();
    });

    it('should initialize with null chartData', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      expect(component.chartData()).toBeNull();
    });

    it('should initialize with loading true', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);
    });

    it('should initialize with null error', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      expect(component.error()).toBeNull();
    });
  });

  describe('successful data loading', () => {
    it('should load requirements on init', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      expect(mockRequirementService.list).toHaveBeenCalledWith('test-plan-id');
    });

    it('should build chart data from requirements', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const chartData = component.chartData();

      expect(chartData).not.toBeNull();
      expect(chartData?.labels).toContain('Approved');
      expect(chartData?.labels).toContain('Draft');
      expect(chartData?.labels).toContain('Implemented');
    });

    it('should set loading to false after successful load', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);

      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('should clear error after successful load', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      // Simulate previous error
      component.error.set('Previous error');
      expect(component.error()).toBe('Previous error');

      fixture.detectChanges();

      expect(component.error()).toBeNull();
    });

    it('should reload requirements when activePlanId changes', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      expect(mockRequirementService.list).toHaveBeenCalledTimes(1);

      // Change active plan
      activePlanIdSignal.set('plan-2');
      TestBed.flushEffects();
      fixture.detectChanges();

      // Should reload with new planId
      expect(mockRequirementService.list).toHaveBeenCalledTimes(2);
      expect(mockRequirementService.list).toHaveBeenCalledWith('plan-2');
    });
  });

  describe('error handling', () => {
    it('should set error when list fails', () => {
      const errorMessage = 'Failed to fetch requirements';
      mockRequirementService.list.mockReturnValue(throwError(() => ({ message: errorMessage })));

      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.error()).toBe(errorMessage);
    });

    it('should set default error message when error has no message', () => {
      mockRequirementService.list.mockReturnValue(throwError(() => ({})));

      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.error()).toBe('Failed to load requirements');
    });

    it('should set loading to false after error', () => {
      mockRequirementService.list.mockReturnValue(throwError(() => ({ message: 'Error' })));

      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      expect(component.loading()).toBe(true);

      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('should keep chartData null when load fails', () => {
      mockRequirementService.list.mockReturnValue(throwError(() => ({ message: 'Error' })));

      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.chartData()).toBeNull();
    });
  });

  // Dark Theme Tests - These should FAIL initially (RED)

  describe('Dark Theme Support', () => {
    /**
     * Helper to get chartOptions value - handles both signal and plain object
     */
    function getChartOptions(component: RequirementsChartComponent): Record<string, unknown> {
      const opts = component.chartOptions as unknown;
      // If it's a function (signal/computed), call it; otherwise return as-is
      return typeof opts === 'function' ? (opts as () => Record<string, unknown>)() : opts as Record<string, unknown>;
    }

    it('should have chartOptions as computed signal for theme reactivity', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      // RED: chartOptions should be a function (signal/computed) not a plain object
      // This will FAIL until we convert chartOptions to computed()
      expect(typeof component.chartOptions).toBe('function');
    });

    it('should have tooltip configuration in chartOptions', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const options = getChartOptions(component);

      // RED: chartOptions should include tooltip styling
      const plugins = options['plugins'] as Record<string, unknown> | undefined;
      const tooltip = plugins?.['tooltip'] as Record<string, unknown> | undefined;

      expect(tooltip).toBeDefined();
      expect(tooltip?.['backgroundColor']).toBeDefined();
      expect(tooltip?.['titleColor']).toBeDefined();
      expect(tooltip?.['bodyColor']).toBeDefined();
    });

    it('should have light theme colors in chartOptions by default', () => {
      themeSignal.set('light');

      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const options = getChartOptions(component);

      // RED: tooltip should have light theme styling (light background, dark text)
      const plugins = options['plugins'] as Record<string, unknown> | undefined;
      const tooltip = plugins?.['tooltip'] as Record<string, unknown> | undefined;

      // Light theme expects light background
      const bg = tooltip?.['backgroundColor'] as string;
      expect(bg).toBeDefined();
      // Should be a light color (white or similar)
      expect(bg).toMatch(/#fff|#ffffff|white|rgb\(255/i);
    });

    it('should have dark theme colors when theme is dark', () => {
      themeSignal.set('dark');

      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const options = getChartOptions(component);

      // RED: tooltip should have dark theme styling
      const plugins = options['plugins'] as Record<string, unknown> | undefined;
      const tooltip = plugins?.['tooltip'] as Record<string, unknown> | undefined;

      // Dark theme expects dark background
      const bg = tooltip?.['backgroundColor'] as string;
      expect(bg).toBeDefined();
      // Should NOT be a light color in dark theme
      expect(bg).not.toMatch(/#fff|#ffffff|white/i);
    });

    it('should update chartOptions when theme changes', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;

      // Get initial options (light theme)
      themeSignal.set('light');
      fixture.detectChanges();
      const lightOptions = getChartOptions(component);
      const lightBg = (lightOptions['plugins'] as Record<string, unknown>)?.['tooltip'] as Record<string, unknown>;

      // Change to dark theme
      themeSignal.set('dark');
      fixture.detectChanges();
      const darkOptions = getChartOptions(component);
      const darkBg = (darkOptions['plugins'] as Record<string, unknown>)?.['tooltip'] as Record<string, unknown>;

      // RED: Options should be different after theme change
      // This will FAIL if chartOptions is not reactive
      expect(darkBg?.['backgroundColor']).not.toBe(lightBg?.['backgroundColor']);
    });

    it('should have border styling for tooltip', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const options = getChartOptions(component);

      const plugins = options['plugins'] as Record<string, unknown> | undefined;
      const tooltip = plugins?.['tooltip'] as Record<string, unknown> | undefined;

      // RED: tooltip should have border styling
      expect(tooltip?.['borderColor']).toBeDefined();
      expect(tooltip?.['borderWidth']).toBeDefined();
    });
  });
});

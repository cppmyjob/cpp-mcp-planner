import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';

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

  const mockPlanStateService = {
    activePlanId: vi.fn(() => 'test-plan-id')
  };

  // Mock ThemeService with signal
  const themeSignal = signal<'light' | 'dark'>('light');
  const mockThemeService = {
    currentTheme: themeSignal
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    themeSignal.set('light');

    await TestBed.configureTestingModule({
      imports: [RequirementsChartComponent],
      providers: [
        { provide: RequirementService, useValue: mockRequirementService },
        { provide: PlanStateService, useValue: mockPlanStateService },
        { provide: ThemeService, useValue: mockThemeService }
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(RequirementsChartComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

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

  describe('Error Handling', () => {
    it('should have error signal', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      expect(component.error).toBeDefined();
      expect(typeof component.error).toBe('function'); // signal
    });

    it('should have loading signal', () => {
      const fixture = TestBed.createComponent(RequirementsChartComponent);
      const component = fixture.componentInstance;

      expect(component.loading).toBeDefined();
      expect(typeof component.loading).toBe('function'); // signal
    });
  });
});

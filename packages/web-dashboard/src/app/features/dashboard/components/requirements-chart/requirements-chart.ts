import { Component, ViewEncapsulation, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';

import { RequirementService, PlanStateService, ThemeService } from '../../../../core/services';
import type { Requirement, RequirementStatus } from '../../../../models';

interface ChartData {
  labels: string[];
  datasets: Array<{
    data: number[];
    backgroundColor: string[];
    borderColor: string[];
    borderWidth: number;
  }>;
}

interface ChartOptions {
  plugins: {
    legend: { display: boolean };
    tooltip: {
      backgroundColor: string;
      titleColor: string;
      bodyColor: string;
      borderColor: string;
      borderWidth: number;
    };
  };
  responsive: boolean;
  maintainAspectRatio: boolean;
}

@Component({
  selector: 'app-requirements-chart',
  imports: [CommonModule, CardModule, ChartModule],
  templateUrl: './requirements-chart.html',
  styleUrl: './requirements-chart.scss',
  encapsulation: ViewEncapsulation.None
})
export class RequirementsChartComponent {
  public readonly chartData = signal<ChartData | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  /**
   * Computed chart options that react to theme changes
   */
  public readonly chartOptions = computed<ChartOptions>(() => {
    const isDark = this.themeService.currentTheme() === 'dark';
    return this.buildChartOptions(isDark);
  });

  private readonly requirementService = inject(RequirementService);
  private readonly planState = inject(PlanStateService);
  private readonly themeService = inject(ThemeService);

  private readonly statusColors: Record<RequirementStatus, string> = {
    draft: '#94a3b8',
    approved: '#3b82f6',
    implemented: '#10b981',
    deferred: '#f59e0b',
    rejected: '#ef4444'
  };

  constructor() {
    // GREEN: Phase 4.2.3 - Add null-guard for activePlanId
    effect(() => {
      const planId = this.planState.activePlanId();
      if (planId !== null) {
        this.loadRequirements(planId);
      }
    });
  }

  /**
   * Build theme-aware chart options
   */
  private buildChartOptions(isDark: boolean): ChartOptions {
    // Light theme colors
    const lightColors = {
      tooltipBg: '#ffffff',
      tooltipText: '#334155',
      tooltipBorder: '#e2e8f0'
    };

    // Dark theme colors
    const darkColors = {
      tooltipBg: '#1e293b',
      tooltipText: '#e2e8f0',
      tooltipBorder: '#475569'
    };

    const colors = isDark ? darkColors : lightColors;

    return {
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: colors.tooltipBg,
          titleColor: colors.tooltipText,
          bodyColor: colors.tooltipText,
          borderColor: colors.tooltipBorder,
          borderWidth: 1
        }
      },
      responsive: true,
      maintainAspectRatio: false
    };
  }

  private loadRequirements(planId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.requirementService.list(planId).subscribe({
      next: (requirements) => {
        this.buildChartData(requirements);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load requirements');
        this.loading.set(false);
      }
    });
  }

  private buildChartData(requirements: Requirement[]): void {
    const statusCounts: Record<RequirementStatus, number> = {
      draft: 0,
      approved: 0,
      implemented: 0,
      deferred: 0,
      rejected: 0
    };

    // Count requirements by status (skip invalid/undefined status)
    requirements.forEach(req => {
      if (req.status !== undefined && req.status in statusCounts) {
        statusCounts[req.status]++;
      }
    });

    const labels: string[] = [];
    const data: number[] = [];
    const backgroundColor: string[] = [];
    const borderColor: string[] = [];

    Object.entries(statusCounts).forEach(([status, count]) => {
      if (count > 0) {
        labels.push(status.charAt(0).toUpperCase() + status.slice(1));
        data.push(count);
        const color = this.statusColors[status as RequirementStatus];
        backgroundColor.push(color + '80'); // 50% opacity
        borderColor.push(color);
      }
    });

    this.chartData.set({
      labels,
      datasets: [{
        data,
        backgroundColor,
        borderColor,
        borderWidth: 2
      }]
    });
  }
}

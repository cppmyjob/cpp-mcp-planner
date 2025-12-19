import { Component, ViewEncapsulation, inject, signal, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';

import { RequirementService, PlanStateService } from '../../../../core/services';
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

@Component({
  selector: 'app-requirements-chart',
  imports: [CommonModule, CardModule, ChartModule],
  templateUrl: './requirements-chart.html',
  styleUrl: './requirements-chart.scss',
  encapsulation: ViewEncapsulation.None
})
export class RequirementsChartComponent implements OnInit {
  private readonly requirementService = inject(RequirementService);
  private readonly planState = inject(PlanStateService);

  public readonly chartData = signal<ChartData | null>(null);
  public readonly chartOptions = {
    plugins: {
      legend: {
        display: false  // Disable legend to prevent undefined from showing
      }
    },
    responsive: true,
    maintainAspectRatio: false
  };
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  private readonly statusColors: Record<RequirementStatus, string> = {
    draft: '#94a3b8',
    approved: '#3b82f6',
    implemented: '#10b981',
    deferred: '#f59e0b',
    rejected: '#ef4444'
  };

  public ngOnInit(): void {
    this.loadRequirements();
  }

  private loadRequirements(): void {
    this.loading.set(true);
    this.error.set(null);

    this.requirementService.list(this.planState.activePlanId()).subscribe({
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

    // GREEN: Filter out requirements with invalid/undefined status
    requirements.forEach(req => {
      if (req.status !== undefined && req.status in statusCounts) {
        statusCounts[req.status]++;
      } else {
        // REFACTOR: Log invalid status for debugging
        console.warn(`Requirement ${req.id} has invalid status:`, req.status);
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

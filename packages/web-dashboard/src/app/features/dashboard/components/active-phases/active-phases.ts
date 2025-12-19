import { Component, ViewEncapsulation, inject, signal, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';

import { PhaseService, PlanStateService } from '../../../../core/services';
import type { Phase } from '../../../../models';

@Component({
  selector: 'app-active-phases',
  imports: [CommonModule, CardModule, TableModule, TagModule, ProgressBarModule],
  templateUrl: './active-phases.html',
  styleUrl: './active-phases.scss',
  encapsulation: ViewEncapsulation.None
})
export class ActivePhasesComponent implements OnInit {
  private readonly phaseService = inject(PhaseService);
  private readonly planState = inject(PlanStateService);

  public readonly phases = signal<Phase[]>([]);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  public ngOnInit(): void {
    this.loadActivePhases();
  }

  private loadActivePhases(): void {
    this.loading.set(true);
    this.error.set(null);

    this.phaseService.list(this.planState.activePlanId(), {
      status: 'in_progress',
      fields: ['title', 'progress', 'priority', 'status', 'path']
    }).subscribe({
      next: (phases) => {
        this.phases.set(phases);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load active phases');
        this.loading.set(false);
      }
    });
  }

  public getPrioritySeverity(priority?: string): 'danger' | 'warn' | 'info' | 'success' {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warn';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'info';
    }
  }
}

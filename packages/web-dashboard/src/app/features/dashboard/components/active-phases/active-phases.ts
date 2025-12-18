import { Component, ViewEncapsulation, inject, signal, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';

import { PhaseService } from '../../../../core/services/api/phase.service';
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

  public readonly phases = signal<Phase[]>([]);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  // TODO: Get active plan ID from state management
  private readonly activePlanId = '9323523a-60c1-4a35-b3b3-20b4205a3415';

  public ngOnInit(): void {
    this.loadActivePhases();
  }

  private loadActivePhases(): void {
    this.loading.set(true);
    this.error.set(null);

    this.phaseService.list(this.activePlanId, {
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

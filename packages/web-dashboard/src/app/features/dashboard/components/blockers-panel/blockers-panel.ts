import { Component, ViewEncapsulation, inject, signal, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

import { PhaseService } from '../../../../core/services/api/phase.service';
import type { Phase } from '../../../../models';

@Component({
  selector: 'app-blockers-panel',
  imports: [CommonModule, CardModule, TagModule],
  templateUrl: './blockers-panel.html',
  styleUrl: './blockers-panel.scss',
  encapsulation: ViewEncapsulation.None
})
export class BlockersPanelComponent implements OnInit {
  private readonly phaseService = inject(PhaseService);

  public readonly blockedPhases = signal<Phase[]>([]);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  // TODO: Get active plan ID from state management
  private readonly activePlanId = '9323523a-60c1-4a35-b3b3-20b4205a3415';

  public ngOnInit(): void {
    this.loadBlockedPhases();
  }

  private loadBlockedPhases(): void {
    this.loading.set(true);
    this.error.set(null);

    this.phaseService.list(this.activePlanId, {
      status: 'blocked',
      fields: ['title', 'blockingReason', 'path', 'priority']
    }).subscribe({
      next: (phases) => {
        this.blockedPhases.set(phases);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load blocked phases');
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

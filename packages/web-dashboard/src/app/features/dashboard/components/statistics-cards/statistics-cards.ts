import { Component, ViewEncapsulation, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { PlanService, PlanStateService } from '../../../../core/services';
import type { PlanStatistics } from '../../../../models';

@Component({
  selector: 'app-statistics-cards',
  imports: [CommonModule, CardModule],
  templateUrl: './statistics-cards.html',
  styleUrl: './statistics-cards.scss',
  encapsulation: ViewEncapsulation.None
})
export class StatisticsCardsComponent {
  public readonly statistics = signal<PlanStatistics | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  private readonly planService = inject(PlanService);
  private readonly planState = inject(PlanStateService);

  constructor() {
    // GREEN: Phase 4.2.3 - Add null-guard for activePlanId
    effect(() => {
      const planId = this.planState.activePlanId();
      if (planId !== null) {
        this.loadStatistics(planId);
      }
    });
  }

  private loadStatistics(planId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.planService.getSummary(planId).subscribe({
      next: (summary) => {
        this.statistics.set(summary.statistics);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load statistics');
        this.loading.set(false);
      }
    });
  }
}

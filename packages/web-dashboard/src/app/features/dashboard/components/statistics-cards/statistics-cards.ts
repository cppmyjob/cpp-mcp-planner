import { Component, ViewEncapsulation, inject, signal, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

import { PlanService } from '../../../../core/services/api/plan.service';
import type { PlanStatistics } from '../../../../models';

@Component({
  selector: 'app-statistics-cards',
  imports: [CommonModule, CardModule],
  templateUrl: './statistics-cards.html',
  styleUrl: './statistics-cards.scss',
  encapsulation: ViewEncapsulation.None
})
export class StatisticsCardsComponent implements OnInit {
  private readonly planService = inject(PlanService);

  public readonly statistics = signal<PlanStatistics | null>(null);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);

  // TODO: Get active plan ID from state management
  private readonly activePlanId = '9323523a-60c1-4a35-b3b3-20b4205a3415';

  public ngOnInit(): void {
    this.loadStatistics();
  }

  private loadStatistics(): void {
    this.loading.set(true);
    this.error.set(null);

    this.planService.getSummary(this.activePlanId).subscribe({
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

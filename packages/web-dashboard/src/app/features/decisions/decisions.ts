import { Component, ViewEncapsulation, inject, signal, effect, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TimelineModule } from 'primeng/timeline';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ChipModule } from 'primeng/chip';
import { MultiSelectModule } from 'primeng/multiselect';

// Shared
import { ScrollContainerDirective } from '../../shared/directives/scroll-container';

// Services and Models
import { DecisionService, PlanStateService } from '../../core/services';
import type { Decision, DecisionStatus } from '../../models';

@Component({
  selector: 'app-decisions',
  imports: [
    CommonModule,
    FormsModule,
    ProgressSpinnerModule,
    MessageModule,
    TimelineModule,
    CardModule,
    TagModule,
    ChipModule,
    MultiSelectModule,
    ScrollContainerDirective
  ],
  templateUrl: './decisions.html',
  styleUrl: './decisions.scss',
  encapsulation: ViewEncapsulation.None
})
export class DecisionsComponent implements OnInit {
  // Public signals
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly decisions = signal<Decision[]>([]);

  /**
   * Status filter options
   */
  public readonly statusOptions: Array<{ label: string; value: DecisionStatus }> = [
    { label: 'Active', value: 'active' },
    { label: 'Superseded', value: 'superseded' },
    { label: 'Reversed', value: 'reversed' }
  ];

  /**
   * Selected status filters (default: all selected)
   */
  public readonly selectedStatuses = signal<DecisionStatus[]>(['active', 'superseded', 'reversed']);

  /**
   * Computed signal: decisions filtered by status and sorted by createdAt descending (newest first)
   */
  public readonly filteredDecisions = computed(() => {
    const selected = this.selectedStatuses();
    const filtered = this.decisions().filter(d => selected.includes(d.status));
    return filtered.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  /**
   * Computed signal: decisions sorted by createdAt descending (newest first)
   * @deprecated Use filteredDecisions instead
   */
  public readonly sortedDecisions = computed(() => {
    return this.filteredDecisions();
  });

  // Injected services
  private readonly decisionService = inject(DecisionService);
  private readonly planState = inject(PlanStateService);

  constructor() {
    // React to plan changes
    effect(() => {
      const planId = this.planState.activePlanId();
      if (planId) {
        this.loadDecisions(planId);
      }
    });
  }

  public ngOnInit(): void {
    // Initial load handled by effect
  }

  /**
   * Generate short DEC-ID from UUID
   */
  public getDecId(decision: Decision): string {
    const shortId = decision.id.substring(0, 3).toUpperCase();
    return `DEC-${shortId}`;
  }

  /**
   * Get status severity for p-tag
   */
  public getStatusSeverity(status: DecisionStatus): 'success' | 'warn' | 'danger' {
    switch (status) {
      case 'active':
        return 'success';
      case 'superseded':
        return 'warn';
      case 'reversed':
        return 'danger';
    }
  }

  /**
   * Format ISO date string for timeline display
   */
  public formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Check if decision has context
   */
  public hasContext(decision: Decision): boolean {
    return !!decision.context && decision.context.trim().length > 0;
  }

  /**
   * Check if decision has consequences
   */
  public hasConsequences(decision: Decision): boolean {
    return !!decision.consequences && decision.consequences.trim().length > 0;
  }

  /**
   * Check if decision has impact scope
   */
  public hasImpactScope(decision: Decision): boolean {
    return Array.isArray(decision.impactScope) && decision.impactScope.length > 0;
  }

  /**
   * Check if decision has alternatives considered
   */
  public hasAlternatives(decision: Decision): boolean {
    return Array.isArray(decision.alternativesConsidered) && decision.alternativesConsidered.length > 0;
  }

  // Supersession Chain Helpers

  /**
   * Check if decision is superseded by another decision
   */
  public isSuperseded(decision: Decision): boolean {
    return !!decision.supersededBy;
  }

  /**
   * Check if decision supersedes another decision
   */
  public doesSupersede(decision: Decision): boolean {
    return !!decision.supersedes;
  }

  /**
   * Find decision by ID from loaded decisions
   */
  public findDecisionById(id: string): Decision | undefined {
    return this.decisions().find(d => d.id === id);
  }

  /**
   * Get title of the decision that superseded this one
   */
  public getSupersedingDecisionTitle(decision: Decision): string | undefined {
    if (!decision.supersededBy) return undefined;
    const superseding = this.findDecisionById(decision.supersededBy);
    return superseding?.title;
  }

  /**
   * Get title of the decision that this one supersedes
   */
  public getSupersededDecisionTitle(decision: Decision): string | undefined {
    if (!decision.supersedes) return undefined;
    const superseded = this.findDecisionById(decision.supersedes);
    return superseded?.title;
  }

  /**
   * Load decisions from API
   */
  private loadDecisions(planId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.decisionService.list(planId).subscribe({
      next: (decisions) => {
        this.decisions.set(decisions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load decisions');
        this.loading.set(false);
      }
    });
  }
}

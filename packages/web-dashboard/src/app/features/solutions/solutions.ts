import { Component, ViewEncapsulation, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

// Services and Models
import { SolutionService, RequirementService, PlanStateService } from '../../core/services';
import type { Solution, SolutionStatus, Requirement } from '../../models';

@Component({
  selector: 'app-solutions',
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    TagModule,
    ProgressBarModule,
    SelectModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './solutions.html',
  styleUrl: './solutions.scss',
  encapsulation: ViewEncapsulation.None
})
export class SolutionsComponent implements OnInit {
  // Public signals
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly selectedRequirementId = signal<string | null>(null);

  // Private signals
  private readonly allSolutions = signal<Solution[]>([]);
  private readonly allRequirements = signal<Requirement[]>([]);

  // Computed: filtered solutions by requirement
  public readonly filteredSolutions = computed<Solution[]>(() => {
    const solutions = this.allSolutions();
    const selectedReqId = this.selectedRequirementId();

    if (!selectedReqId) {
      return solutions;
    }

    // Filter solutions that address selected requirement
    return solutions.filter(sol => sol.addressing?.includes(selectedReqId));
  });

  // Requirement options for dropdown
  public readonly requirementOptions = computed(() => {
    return this.allRequirements().map(req => ({
      label: `${this.getReqId(req)} - ${req.title}`,
      value: req.id
    }));
  });

  // Injected services
  private readonly solutionService = inject(SolutionService);
  private readonly requirementService = inject(RequirementService);
  private readonly planState = inject(PlanStateService);
  private readonly messageService = inject(MessageService);

  constructor() {
    // React to plan changes
    effect(() => {
      const planId = this.planState.activePlanId();
      if (planId) {
        this.loadData(planId);
      }
    });
  }

  public ngOnInit(): void {
    // Initial load handled by effect
  }

  /**
   * Generate short REQ-ID from UUID
   */
  public getReqId(requirement: Requirement): string {
    const shortId = requirement.id.substring(0, 3).toUpperCase();
    return `REQ-${shortId}`;
  }

  /**
   * Generate short SOL-ID from UUID
   */
  public getSolId(solution: Solution): string {
    const shortId = solution.id.substring(0, 3).toUpperCase();
    return `SOL-${shortId}`;
  }

  /**
   * Generate short ID from UUID (generic)
   */
  public getShortId(id: string): string {
    return id.substring(0, 3).toUpperCase();
  }

  /**
   * Get status severity for p-tag
   */
  public getStatusSeverity(status: SolutionStatus): 'success' | 'warn' | 'danger' | 'secondary' | 'info' {
    switch (status) {
      case 'selected':
        return 'success';
      case 'evaluated':
        return 'info';
      case 'rejected':
        return 'danger';
      case 'implemented':
        return 'success';
      case 'proposed':
      default:
        return 'secondary';
    }
  }

  /**
   * Format effort estimate for display
   */
  public formatEffort(effort: { value: number; unit: string }): string {
    const unitMap: Record<string, string> = {
      'minutes': 'min',
      'hours': 'h',
      'days': 'd',
      'weeks': 'w',
      'story-points': 'SP'
    };

    const unit = unitMap[effort.unit] ?? effort.unit;
    return `${effort.value} ${unit}`;
  }

  /**
   * Get confidence severity for p-tag
   */
  public getConfidenceSeverity(confidence: 'low' | 'medium' | 'high'): 'success' | 'warn' | 'danger' {
    switch (confidence) {
      case 'high':
        return 'success';
      case 'medium':
        return 'warn';
      case 'low':
        return 'danger';
    }
  }

  /**
   * Get feasibility severity for p-tag
   */
  public getFeasibilitySeverity(feasibility: 'high' | 'medium' | 'low'): 'success' | 'warn' | 'danger' {
    switch (feasibility) {
      case 'high':
        return 'success';
      case 'medium':
        return 'warn';
      case 'low':
        return 'danger';
    }
  }

  /**
   * Check if solution can be selected
   */
  public canSelect(solution: Solution): boolean {
    return solution.status === 'proposed' || solution.status === 'evaluated';
  }

  /**
   * Check if solution can be rejected
   */
  public canReject(solution: Solution): boolean {
    return solution.status === 'proposed' || solution.status === 'evaluated';
  }

  /**
   * View solution details (placeholder for future modal/routing)
   */
  public viewDetails(solution: Solution): void {
    this.messageService.add({
      severity: 'info',
      summary: 'View Details',
      detail: `Viewing details for ${solution.title} (feature coming soon)`
    });
  }

  /**
   * Select solution
   */
  public selectSolution(solution: Solution): void {
    const planId = this.planState.activePlanId();
    if (!planId) {
      return;
    }

    this.solutionService.select(planId, solution.id, {
      reason: 'Selected from UI',
      createDecisionRecord: false
    }).subscribe({
      next: () => {
        // Reload solutions to get updated status
        this.loadSolutions(planId);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Solution "${solution.title}" selected`
        });
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.message ?? 'Failed to select solution'
        });
      }
    });
  }

  /**
   * Reject solution
   */
  public rejectSolution(solution: Solution): void {
    const planId = this.planState.activePlanId();
    if (!planId) {
      return;
    }

    // Update status to rejected
    this.solutionService.update(planId, solution.id, {
      status: 'rejected'
    }).subscribe({
      next: () => {
        // Reload solutions to get updated status
        this.loadSolutions(planId);
        this.messageService.add({
          severity: 'warn',
          summary: 'Solution Rejected',
          detail: `Solution "${solution.title}" rejected`
        });
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.message ?? 'Failed to reject solution'
        });
      }
    });
  }

  /**
   * Load all data for active plan
   */
  private loadData(planId: string): void {
    this.loading.set(true);
    this.error.set(null);

    // Load solutions and requirements in parallel
    this.loadSolutions(planId);
    this.loadRequirements(planId);
  }

  /**
   * Load solutions
   */
  private loadSolutions(planId: string): void {
    this.solutionService.list(planId).subscribe({
      next: (solutions) => {
        this.allSolutions.set(solutions);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load solutions');
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load solutions'
        });
      }
    });
  }

  /**
   * Load requirements for filter
   */
  private loadRequirements(planId: string): void {
    this.requirementService.list(planId).subscribe({
      next: (requirements) => {
        this.allRequirements.set(requirements);
      },
      error: () => {
        // Non-critical error, just log
        this.messageService.add({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Failed to load requirements for filter'
        });
      }
    });
  }
}

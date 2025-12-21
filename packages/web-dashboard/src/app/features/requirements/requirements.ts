import { Component, ViewEncapsulation, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollContainerDirective } from '../../shared/directives/scroll-container';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ChipModule } from 'primeng/chip';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { DragDropModule } from 'primeng/dragdrop';
import { MessageService } from 'primeng/api';

// Services and Models
import { RequirementService, LinkService, SolutionService, PlanStateService } from '../../core/services';
import type {
  Requirement,
  RequirementStatus,
  RequirementPriority,
  RequirementCategory,
  CreateRequirementDto,
  Link,
  Solution
} from '../../models';

interface KanbanColumn {
  status: RequirementStatus;
  title: string;
  requirements: RequirementWithCoverage[];
}

interface RequirementWithCoverage extends Requirement {
  coveredBy?: Solution[];
}

interface PriorityOption {
  label: string;
  value: RequirementPriority;
}

interface CategoryOption {
  label: string;
  value: RequirementCategory;
}

@Component({
  selector: 'app-requirements',
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    TagModule,
    ChipModule,
    DialogModule,
    SelectModule,
    TextareaModule,
    ToastModule,
    DragDropModule,
    ScrollContainerDirective
  ],
  providers: [MessageService],
  templateUrl: './requirements.html',
  styleUrl: './requirements.scss',
  encapsulation: ViewEncapsulation.None
})
export class RequirementsComponent implements OnInit {
  // Public fields
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly searchTerm = signal('');
  public readonly showAddDialog = signal(false);

  /**
   * Kanban columns configuration
   */
  private readonly columnDefinitions: Array<{ status: RequirementStatus; title: string }> = [
    { status: 'draft', title: 'DRAFT' },
    { status: 'approved', title: 'APPROVED' },
    { status: 'implemented', title: 'IMPLEMENTED' },
    { status: 'deferred', title: 'DEFERRED' },
    { status: 'rejected', title: 'REJECTED' }
  ];

  /**
   * Filtered requirements grouped by status
   */
  public readonly kanbanColumns = computed<KanbanColumn[]>(() => {
    const requirements = this.allRequirements();
    const search = this.searchTerm().toLowerCase();

    // Filter by search term
    const filtered = search
      ? requirements.filter(req =>
          req.title.toLowerCase().includes(search) ||
          req.description?.toLowerCase().includes(search)
        )
      : requirements;

    // Group by status
    return this.columnDefinitions.map(col => ({
      ...col,
      requirements: filtered.filter(req => req.status === col.status)
    }));
  });

  // Form state
  public readonly newRequirement = signal<Partial<CreateRequirementDto>>({
    title: '',
    description: '',
    priority: 'medium',
    category: 'functional',
    source: { type: 'user-request' }
  });

  public readonly priorityOptions: PriorityOption[] = [
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' }
  ];

  public readonly categoryOptions: CategoryOption[] = [
    { label: 'Functional', value: 'functional' },
    { label: 'Non-Functional', value: 'non-functional' },
    { label: 'Technical', value: 'technical' },
    { label: 'Business', value: 'business' }
  ];

  public draggedRequirement: RequirementWithCoverage | null = null;

  // Private fields
  private readonly allRequirements = signal<RequirementWithCoverage[]>([]);
  private readonly solutionsMap = signal<Map<string, Solution>>(new Map());
  private readonly requirementService = inject(RequirementService);
  private readonly linkService = inject(LinkService);
  private readonly solutionService = inject(SolutionService);
  private readonly planState = inject(PlanStateService);
  private readonly messageService = inject(MessageService);

  constructor() {
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

  // Public methods

  /**
   * Generate short REQ-ID from UUID
   */
  public getReqId(requirement: Requirement): string {
    // Take first 3 digits from UUID
    const shortId = requirement.id.substring(0, 3).toUpperCase();
    return `REQ-${shortId}`;
  }

  /**
   * Open add requirement dialog
   */
  public openAddDialog(): void {
    this.newRequirement.set({
      title: '',
      description: '',
      priority: 'medium',
      category: 'functional',
      source: { type: 'user-request' }
    });
    this.showAddDialog.set(true);
  }

  /**
   * Save new requirement
   */
  public saveRequirement(): void {
    const planId = this.planState.activePlanId();
    if (!planId) {
      return;
    }

    const dto = this.newRequirement();
    if (!dto.title || !dto.source) {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Title is required'
      });
      return;
    }

    this.requirementService.create(planId, dto as CreateRequirementDto).subscribe({
      next: (requirement) => {
        this.allRequirements.update(reqs => [...reqs, requirement as RequirementWithCoverage]);
        this.showAddDialog.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Requirement created successfully'
        });
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.message ?? 'Failed to create requirement'
        });
      }
    });
  }

  /**
   * Handle drag start - PrimeNG pDraggable
   */
  public onDragStart(requirement: RequirementWithCoverage): void {
    this.draggedRequirement = requirement;
  }

  /**
   * Handle drag end - PrimeNG pDraggable
   */
  public onDragEnd(): void {
    this.draggedRequirement = null;
  }

  /**
   * Handle drop - PrimeNG pDroppable
   */
  public onDrop(targetStatus: RequirementStatus): void {
    if (!this.draggedRequirement) {
      return;
    }

    const requirement = this.draggedRequirement;
    if (requirement.status === targetStatus) {
      this.draggedRequirement = null;
      return;
    }

    const planId = this.planState.activePlanId();
    if (!planId) {
      return;
    }

    // Optimistic update
    const previousStatus = requirement.status;
    this.allRequirements.update(reqs =>
      reqs.map(r => r.id === requirement.id ? { ...r, status: targetStatus } : r)
    );

    // Update status via API
    this.requirementService.update(planId, requirement.id, { status: targetStatus }).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Requirement moved to ${targetStatus}`
        });
        this.draggedRequirement = null;
      },
      error: (err) => {
        // Rollback on error
        this.allRequirements.update(reqs =>
          reqs.map(r => r.id === requirement.id ? { ...r, status: previousStatus } : r)
        );
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err.message ?? 'Failed to update requirement status'
        });
        this.draggedRequirement = null;
      }
    });
  }

  /**
   * Get priority severity for p-tag
   */
  public getPrioritySeverity(priority: RequirementPriority): 'danger' | 'warn' | 'info' | 'success' {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warn';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
    }
  }

  /**
   * Get tags from requirement metadata
   */
  public getTags(requirement: Requirement): string[] {
    if (!requirement.metadata?.tags) {
      return [];
    }

    return requirement.metadata.tags
      .filter(tag => tag.key === 'tag')
      .map(tag => tag.value);
  }

  /**
   * Get "Covered by" solutions for requirement
   */
  public getCoveredBy(requirement: RequirementWithCoverage): Solution[] {
    return requirement.coveredBy ?? [];
  }

  /**
   * Format solution ID for display
   */
  public getSolutionId(solution: Solution): string {
    const shortId = solution.id.substring(0, 3).toUpperCase();
    return `SOL-${shortId}`;
  }

  // Private methods

  /**
   * Load all data for active plan
   */
  private loadData(planId: string): void {
    this.loading.set(true);
    this.error.set(null);

    // Load requirements
    this.requirementService.list(planId).subscribe({
      next: (requirements) => {
        // Load solutions and links to populate "covered by"
        this.loadSolutionsAndLinks(planId, requirements);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load requirements');
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load requirements'
        });
      }
    });
  }

  /**
   * Load solutions and links to populate coverage info
   */
  private loadSolutionsAndLinks(planId: string, requirements: Requirement[]): void {
    // Load all solutions first
    this.solutionService.list(planId).subscribe({
      next: (solutions) => {
        const solMap = new Map<string, Solution>();
        for (const sol of solutions) {
          solMap.set(sol.id, sol);
        }
        this.solutionsMap.set(solMap);

        // Now load links for each implemented requirement
        const implementedReqs = requirements.filter(r => r.status === 'implemented');

        if (implementedReqs.length === 0) {
          // No implemented requirements, just set data
          this.allRequirements.set(requirements as RequirementWithCoverage[]);
          this.loading.set(false);
          return;
        }

        // Load links for implemented requirements
        this.loadCoverageLinks(planId, requirements, solMap);
      },
      error: () => {
        // If solutions fail, still show requirements without coverage
        this.allRequirements.set(requirements as RequirementWithCoverage[]);
        this.loading.set(false);
      }
    });
  }

  /**
   * Load coverage links for requirements
   */
  private loadCoverageLinks(
    planId: string,
    requirements: Requirement[],
    solutionsMap: Map<string, Solution>
  ): void {
    const requirementsWithCoverage: RequirementWithCoverage[] = requirements.map(req => ({
      ...req,
      coveredBy: []
    }));

    // Create a map for quick lookup
    const reqMap = new Map<string, RequirementWithCoverage>();
    for (const req of requirementsWithCoverage) {
      reqMap.set(req.id, req);
    }

    // Load all links for implemented requirements
    const implementedIds = requirements
      .filter(r => r.status === 'implemented')
      .map(r => r.id);

    let completedCount = 0;
    const totalCount = implementedIds.length;

    if (totalCount === 0) {
      this.allRequirements.set(requirementsWithCoverage);
      this.loading.set(false);
      return;
    }

    for (const reqId of implementedIds) {
      this.linkService.getForEntity(planId, reqId, {
        direction: 'incoming',
        relationType: 'implements'
      }).subscribe({
        next: (links) => {
          const req = reqMap.get(reqId);
          if (req) {
            req.coveredBy = links
              .map(link => solutionsMap.get(link.sourceId))
              .filter((sol): sol is Solution => sol !== undefined);
          }
          completedCount++;
          if (completedCount === totalCount) {
            this.allRequirements.set(requirementsWithCoverage);
            this.loading.set(false);
          }
        },
        error: () => {
          completedCount++;
          if (completedCount === totalCount) {
            this.allRequirements.set(requirementsWithCoverage);
            this.loading.set(false);
          }
        }
      });
    }
  }
}

import { Component, ViewEncapsulation, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
import { MessageService } from 'primeng/api';

// Services and Models
import { RequirementService, PlanStateService } from '../../core/services';
import type {
  Requirement,
  RequirementStatus,
  RequirementPriority,
  RequirementCategory,
  CreateRequirementDto
} from '../../models';

interface KanbanColumn {
  status: RequirementStatus;
  title: string;
  requirements: Requirement[];
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
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './requirements.html',
  styleUrl: './requirements.scss',
  encapsulation: ViewEncapsulation.None
})
export class RequirementsComponent {
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly searchTerm = signal('');
  public readonly showAddDialog = signal(false);

  private readonly allRequirements = signal<Requirement[]>([]);

  /**
   * Kanban columns configuration
   */
  public readonly columns: KanbanColumn[] = [
    { status: 'draft', title: 'DRAFT', requirements: [] },
    { status: 'approved', title: 'APPROVED', requirements: [] },
    { status: 'implemented', title: 'IMPLEMENTED', requirements: [] },
    { status: 'deferred', title: 'DEFERRED', requirements: [] },
    { status: 'rejected', title: 'REJECTED', requirements: [] }
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
    const grouped = this.columns.map(col => ({
      ...col,
      requirements: filtered.filter(req => req.status === col.status)
    }));

    return grouped;
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

  public draggedRequirement: Requirement | null = null;

  private readonly requirementService = inject(RequirementService);
  private readonly planState = inject(PlanStateService);
  private readonly messageService = inject(MessageService);

  constructor() {
    effect(() => {
      const planId = this.planState.activePlanId();
      this.loadRequirements(planId);
    });
  }

  /**
   * Load requirements for active plan
   */
  private loadRequirements(planId: string): void {
    if (!planId) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.requirementService.list(planId).subscribe({
      next: (requirements) => {
        this.allRequirements.set(requirements);
        this.loading.set(false);
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
        this.allRequirements.update(reqs => [...reqs, requirement]);
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
   * Handle drag start
   */
  public onDragStart(requirement: Requirement): void {
    this.draggedRequirement = requirement;
  }

  /**
   * Handle drag end
   */
  public onDragEnd(): void {
    this.draggedRequirement = null;
  }

  /**
   * Handle drop
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

    // Update status via API
    this.requirementService.update(planId, requirement.id, { status: targetStatus }).subscribe({
      next: (updated) => {
        // Update local state
        this.allRequirements.update(reqs =>
          reqs.map(r => r.id === updated.id ? updated : r)
        );

        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Requirement moved to ${targetStatus}`
        });

        this.draggedRequirement = null;
      },
      error: (err) => {
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
   * Handle drag over (allow drop)
   */
  public onDragOver(event: DragEvent): void {
    event.preventDefault();
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
}

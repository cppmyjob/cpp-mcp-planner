import { Component, ViewEncapsulation, inject, signal, computed, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TreeTableModule, type TreeTableNodeExpandEvent } from 'primeng/treetable';
import { type TreeNode } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { CardModule } from 'primeng/card';

import { PhaseService, PlanStateService } from '../../core/services';
import type { Phase, PhaseTreeNode, PhaseStatus } from '../../models';

@Component({
  selector: 'app-phases',
  imports: [
    CommonModule,
    TreeTableModule,
    TagModule,
    ProgressBarModule,
    ButtonModule,
    TooltipModule,
    CardModule
  ],
  templateUrl: './phases.html',
  styleUrl: './phases.scss',
  encapsulation: ViewEncapsulation.None
})
export class PhasesComponent implements OnInit {
  // Public signals (before private fields per eslint member-ordering)
  public readonly treeNodes = signal<TreeNode<Phase>[]>([]);
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly allExpanded = signal(false);

  public readonly totalPhases = computed(() => this.countNodes(this.treeNodes()));
  public readonly completedPhases = computed(() =>
    this.countNodesByStatus(this.treeNodes(), 'completed')
  );
  public readonly inProgressPhases = computed(() =>
    this.countNodesByStatus(this.treeNodes(), 'in_progress')
  );

  // Private injected services
  private readonly phaseService = inject(PhaseService);
  private readonly planState = inject(PlanStateService);

  public ngOnInit(): void {
    this.loadPhaseTree();
  }

  public loadPhaseTree(): void {
    this.loading.set(true);
    this.error.set(null);

    this.phaseService.getTree(this.planState.activePlanId(), {
      fields: ['title', 'status', 'progress', 'priority', 'path', 'description', 'blockingReason']
    }).subscribe({
      next: (tree) => {
        this.treeNodes.set(this.transformToTreeNodes(tree));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load phase tree');
        this.loading.set(false);
      }
    });
  }

  public toggleExpandAll(): void {
    const expanded = !this.allExpanded();
    this.allExpanded.set(expanded);
    this.treeNodes.update(nodes => this.setExpandedRecursive(nodes, expanded));
  }

  public onNodeExpand(_event: TreeTableNodeExpandEvent): void {
    // Expansion state tracking can be added here if needed
  }

  public getStatusSeverity(status: PhaseStatus | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'info';
      case 'blocked':
        return 'danger';
      case 'skipped':
        return 'secondary';
      case 'planned':
        return 'warn';
      case undefined:
        return 'warn';
    }
  }

  public getStatusLabel(status: PhaseStatus | undefined): string {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'blocked':
        return 'Blocked';
      case 'skipped':
        return 'Skipped';
      case 'planned':
        return 'Planned';
      case undefined:
        return 'Planned';
    }
  }

  public getPrioritySeverity(priority: string | undefined): 'danger' | 'warn' | 'info' | 'success' | 'secondary' {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warn';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      case undefined:
        return 'secondary';
      default:
        return 'secondary';
    }
  }

  public getProgressBarClass(progress: number): string {
    if (progress >= 100) return 'phases__progress--complete';
    if (progress >= 50) return 'phases__progress--half';
    if (progress > 0) return 'phases__progress--started';
    return 'phases__progress--empty';
  }

  private transformToTreeNodes(apiNodes: PhaseTreeNode[]): TreeNode<Phase>[] {
    return apiNodes.map(node => this.transformNode(node));
  }

  private transformNode(apiNode: PhaseTreeNode): TreeNode<Phase> {
    const treeNode: TreeNode<Phase> = {
      data: apiNode.phase,
      children: apiNode.children.map(child => this.transformNode(child)),
      expanded: apiNode.depth < 1, // Expand first level by default
      leaf: !apiNode.hasChildren
    };
    return treeNode;
  }

  private setExpandedRecursive(nodes: TreeNode<Phase>[], expanded: boolean): TreeNode<Phase>[] {
    return nodes.map(node => ({
      ...node,
      expanded,
      children: node.children ? this.setExpandedRecursive(node.children, expanded) : []
    }));
  }

  private countNodes(nodes: TreeNode<Phase>[]): number {
    let count = 0;
    for (const node of nodes) {
      count++;
      if (node.children) {
        count += this.countNodes(node.children);
      }
    }
    return count;
  }

  private countNodesByStatus(nodes: TreeNode<Phase>[], status: PhaseStatus): number {
    let count = 0;
    for (const node of nodes) {
      if (node.data?.status === status) {
        count++;
      }
      if (node.children) {
        count += this.countNodesByStatus(node.children, status);
      }
    }
    return count;
  }
}

import { Component, inject, output, signal, effect, ViewEncapsulation, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ThemeService, PlanService, PlanStateService, ProjectService, ProjectStateService } from '../../core';
import { ProjectInitDialogComponent } from '../../shared';
import type { PlanManifest, ProjectInfo } from '../../models';

@Component({
  selector: 'app-header',
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, ProjectInitDialogComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  encapsulation: ViewEncapsulation.None
})
export class HeaderComponent {
  public readonly sidebarToggle = output<void>();

  // Project Selector signals
  public readonly projects = signal<ProjectInfo[]>([]);
  public readonly selectedProjectId = signal<string>('');
  public readonly loadingProjects = signal(false);

  // Plan Selector signals
  public readonly plans = signal<PlanManifest[]>([]);
  public readonly selectedPlanId = signal<string>('');
  public readonly loadingPlans = signal(false);

  // Dialog reference
  public readonly projectInitDialog = viewChild<ProjectInitDialogComponent>('projectInitDialog');

  private readonly themeService = inject(ThemeService);
  private readonly projectService = inject(ProjectService);
  private readonly projectState = inject(ProjectStateService);
  private readonly planService = inject(PlanService);
  private readonly planState = inject(PlanStateService);

  // Getters
  public get isDarkTheme(): boolean {
    return this.themeService.currentTheme() === 'dark';
  }

  constructor() {
    // Load projects once on initialization
    this.loadProjects();

    // Sync selectedProjectId with activeProjectId changes
    effect(() => {
      const activeProjectId = this.projectState.activeProjectId();
      this.selectedProjectId.set(activeProjectId);
    });

    // Sync selectedPlanId with activePlanId changes
    effect(() => {
      const activePlanId = this.planState.activePlanId();
      this.selectedPlanId.set(activePlanId);
    });

    // Reload plans when project changes
    effect(() => {
      const projectId = this.selectedProjectId();
      if (projectId) {
        this.loadPlans();
      }
    });
  }

  // Public methods
  public toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  public onSidebarToggle(): void {
    this.sidebarToggle.emit();
  }

  public onProjectChange(projectId: string): void {
    this.projectState.setActiveProject(projectId);
    // selectedProjectId will be updated automatically by effect
    // plans will be reloaded automatically by effect
  }

  public onPlanChange(planId: string): void {
    this.planState.setActivePlan(planId);
    // selectedPlanId will be updated automatically by effect
  }

  public showProjectInitDialog(): void {
    this.projectInitDialog()?.show();
  }

  public onProjectCreated(projectId: string): void {
    // Reload projects list
    this.loadProjects();
    // Set as active project
    this.projectState.setActiveProject(projectId);
  }

  // Private methods
  private loadProjects(): void {
    this.loadingProjects.set(true);
    this.projectService.list().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.loadingProjects.set(false);
      },
      error: () => {
        this.loadingProjects.set(false);
      }
    });
  }

  private loadPlans(): void {
    const projectId = this.selectedProjectId();
    if (!projectId) {
      return;
    }

    this.loadingPlans.set(true);
    this.planService.list({ projectId }).subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loadingPlans.set(false);
      },
      error: () => {
        this.loadingPlans.set(false);
      }
    });
  }
}

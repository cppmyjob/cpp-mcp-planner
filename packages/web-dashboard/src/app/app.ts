import { Component, signal, inject, type OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ThemeService, PlanService, RequirementService } from './core';
import type { PlanManifest, Requirement, RequirementPriority } from './models';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    CommonModule,
    ButtonModule,
    TableModule,
    TagModule,
    ProgressSpinnerModule,
    MessageModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  // Protected readonly signals (public interface)
  protected readonly title = signal('MCP Planning Dashboard');
  protected readonly themeService = inject(ThemeService);
  protected readonly plans = signal<PlanManifest[]>([]);
  protected readonly selectedPlan = signal<PlanManifest | null>(null);
  protected readonly requirements = signal<Requirement[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // Private services
  private readonly planService = inject(PlanService);
  private readonly requirementService = inject(RequirementService);

  // Protected getters
  protected get isDarkTheme(): boolean {
    return this.themeService.currentTheme() === 'dark';
  }

  // Lifecycle hooks
  public ngOnInit(): void {
    this.loadPlans();
  }

  // Protected methods
  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected selectPlan(plan: PlanManifest): void {
    this.selectedPlan.set(plan);
    this.loadRequirements(plan.id);
  }

  protected getPrioritySeverity(priority: RequirementPriority): 'danger' | 'warn' | 'info' | 'secondary' {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warn';
      case 'medium':
        return 'info';
      case 'low':
        return 'secondary';
    }
  }

  protected getStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'secondary' {
    switch (status) {
      case 'approved':
        return 'success';
      case 'proposed':
        return 'info';
      case 'draft':
        return 'warn';
      default:
        return 'secondary';
    }
  }

  // Private methods
  private loadPlans(): void {
    this.loading.set(true);
    this.error.set(null);

    this.planService.list().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        if (plans.length > 0) {
          this.selectPlan(plans[0]);
        } else {
          this.loading.set(false);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.message ?? 'Failed to load plans');
      }
    });
  }

  private loadRequirements(planId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.requirementService.list(planId).subscribe({
      next: (requirements) => {
        this.requirements.set(requirements);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.message ?? 'Failed to load requirements');
      }
    });
  }
}

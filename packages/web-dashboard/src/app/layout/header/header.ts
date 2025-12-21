import { Component, inject, output, signal, effect, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ThemeService, PlanService, PlanStateService } from '../../core';
import type { PlanManifest } from '../../models';

@Component({
  selector: 'app-header',
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  encapsulation: ViewEncapsulation.None
})
export class HeaderComponent {
  public readonly sidebarToggle = output<void>();

  // Plan Selector signals
  public readonly plans = signal<PlanManifest[]>([]);
  public readonly selectedPlanId = signal<string>('');
  public readonly loading = signal(false);

  private readonly themeService = inject(ThemeService);
  private readonly planService = inject(PlanService);
  private readonly planState = inject(PlanStateService);

  // Getters
  public get isDarkTheme(): boolean {
    return this.themeService.currentTheme() === 'dark';
  }

  constructor() {
    // Load plans once on initialization
    this.loadPlans();

    // Sync selectedPlanId with activePlanId changes
    effect(() => {
      const activePlanId = this.planState.activePlanId();
      this.selectedPlanId.set(activePlanId);
    });
  }

  // Public methods
  public toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  public onSidebarToggle(): void {
    this.sidebarToggle.emit();
  }

  public onPlanChange(planId: string): void {
    this.planState.setActivePlan(planId);
    // selectedPlanId will be updated automatically by effect
  }

  // Private methods
  private loadPlans(): void {
    this.loading.set(true);
    this.planService.list().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }
}

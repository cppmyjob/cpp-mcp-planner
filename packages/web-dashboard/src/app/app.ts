import { Component, inject, signal, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent, SidebarComponent } from './layout';
import { PlanStateService } from './core';
import type { PlanManifest } from './models';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    CommonModule,
    HeaderComponent,
    SidebarComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None
})
export class AppComponent {
  public readonly sidebarCollapsed = signal(false);
  public readonly selectedPlan = signal<PlanManifest | null>(null);

  private readonly planState = inject(PlanStateService);

  public toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  public onPlanSelected(plan: PlanManifest): void {
    // FIX: Update global state through PlanStateService
    this.planState.setActivePlan(plan.id);
    this.selectedPlan.set(plan);
  }
}

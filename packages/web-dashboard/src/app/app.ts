import { Component, signal, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent, SidebarComponent } from './layout';
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

  public toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  public onPlanSelected(plan: PlanManifest): void {
    this.selectedPlan.set(plan);
  }
}

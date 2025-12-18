import { Component, signal, output, input, inject, ViewEncapsulation, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuModule } from 'primeng/menu';
import { RippleModule } from 'primeng/ripple';
import { PanelMenuModule } from 'primeng/panelmenu';
import { PlanService } from '../../core';
import type { PlanManifest } from '../../models';

interface NavItem {
  label: string;
  icon: string;
  routerLink?: string[];
  testId: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterModule, MenuModule, RippleModule, PanelMenuModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  encapsulation: ViewEncapsulation.None
})
export class SidebarComponent implements OnInit {
  // Public inputs
  public readonly collapsed = input(false);
  public readonly selectedPlanId = input('');

  // Public outputs
  public readonly planSelected = output<PlanManifest>();

  // Public signals
  public readonly plans = signal<PlanManifest[]>([]);
  public readonly loading = signal(false);

  // Public readonly
  public readonly navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'pi pi-home', routerLink: ['dashboard'], testId: 'nav-dashboard' },
    { label: 'Requirements', icon: 'pi pi-list-check', routerLink: ['requirements'], testId: 'nav-requirements' },
    { label: 'Solutions', icon: 'pi pi-lightbulb', routerLink: ['solutions'], testId: 'nav-solutions' },
    { label: 'Decisions', icon: 'pi pi-check-square', routerLink: ['decisions'], testId: 'nav-decisions' },
    { label: 'Phases', icon: 'pi pi-sitemap', routerLink: ['phases'], testId: 'nav-phases' },
    { label: 'Artifacts', icon: 'pi pi-code', routerLink: ['artifacts'], testId: 'nav-artifacts' }
  ];

  // Private services
  private readonly planService = inject(PlanService);

  public ngOnInit(): void {
    this.loadPlans();
  }

  public selectPlan(plan: PlanManifest): void {
    this.planSelected.emit(plan);
  }

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

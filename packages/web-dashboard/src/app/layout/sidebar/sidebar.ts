import { Component, input, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuModule } from 'primeng/menu';
import { RippleModule } from 'primeng/ripple';
import { PanelMenuModule } from 'primeng/panelmenu';

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
export class SidebarComponent {
  // Public inputs
  public readonly collapsed = input(false);

  // Public readonly
  public readonly navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'pi pi-home', routerLink: ['dashboard'], testId: 'nav-dashboard' },
    { label: 'Requirements', icon: 'pi pi-list-check', routerLink: ['requirements'], testId: 'nav-requirements' },
    { label: 'Solutions', icon: 'pi pi-lightbulb', routerLink: ['solutions'], testId: 'nav-solutions' },
    { label: 'Decisions', icon: 'pi pi-check-square', routerLink: ['decisions'], testId: 'nav-decisions' },
    { label: 'Phases', icon: 'pi pi-sitemap', routerLink: ['phases'], testId: 'nav-phases' },
    { label: 'Artifacts', icon: 'pi pi-code', routerLink: ['artifacts'], testId: 'nav-artifacts' }
  ];
}

import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollContainerDirective } from '../../shared/directives/scroll-container';

import { StatisticsCardsComponent } from './components/statistics-cards/statistics-cards';
import { RequirementsChartComponent } from './components/requirements-chart/requirements-chart';
import { ActivePhasesComponent } from './components/active-phases/active-phases';
import { BlockersPanelComponent } from './components/blockers-panel/blockers-panel';

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule,
    ScrollContainerDirective,
    StatisticsCardsComponent,
    RequirementsChartComponent,
    ActivePhasesComponent,
    BlockersPanelComponent
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  encapsulation: ViewEncapsulation.None
})
export class DashboardComponent {}

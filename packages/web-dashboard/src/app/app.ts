import { Component, signal, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HeaderComponent, SidebarComponent } from './layout';

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

  public toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }
}

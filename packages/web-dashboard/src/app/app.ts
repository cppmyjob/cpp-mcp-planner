import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  protected readonly title = signal('MCP Planning Dashboard');
  protected readonly themeService = inject(ThemeService);

  protected get isDarkTheme(): boolean {
    return this.themeService.currentTheme() === 'dark';
  }

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}

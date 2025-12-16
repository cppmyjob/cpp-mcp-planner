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
export class App {
  protected readonly title = signal('MCP Planning Dashboard');
  protected readonly themeService = inject(ThemeService);

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected get isDarkTheme(): boolean {
    return this.themeService.currentTheme() === 'dark';
  }
}

import { Component, inject, output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ThemeService } from '../../core';

@Component({
  selector: 'app-header',
  imports: [CommonModule, ButtonModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  encapsulation: ViewEncapsulation.None
})
export class HeaderComponent {
  public readonly sidebarToggle = output<void>();

  private readonly themeService = inject(ThemeService);

  public get isDarkTheme(): boolean {
    return this.themeService.currentTheme() === 'dark';
  }

  public toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  public onSidebarToggle(): void {
    this.sidebarToggle.emit();
  }
}

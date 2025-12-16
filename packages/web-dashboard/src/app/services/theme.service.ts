import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  public readonly currentTheme = signal<Theme>('light');
  private readonly themeStorageKey = 'app-theme';
  private readonly darkThemeClass = 'dark-theme';

  constructor() {
    // Load theme from localStorage on initialization
    this.loadTheme();

    // Apply theme changes to document body
    effect(() => {
      this.applyTheme(this.currentTheme());
    });
  }

  public toggleTheme(): void {
    const newTheme: Theme = this.currentTheme() === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  public setTheme(theme: Theme): void {
    this.currentTheme.set(theme);
    this.saveTheme(theme);
  }

  private loadTheme(): void {
    const savedTheme = localStorage.getItem(this.themeStorageKey) as Theme | null;

    if (savedTheme === 'light' || savedTheme === 'dark') {
      this.currentTheme.set(savedTheme);
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme.set(prefersDark ? 'dark' : 'light');
    }
  }

  private saveTheme(theme: Theme): void {
    localStorage.setItem(this.themeStorageKey, theme);
  }

  private applyTheme(theme: Theme): void {
    const body = document.body;

    if (theme === 'dark') {
      body.classList.add(this.darkThemeClass);
    } else {
      body.classList.remove(this.darkThemeClass);
    }
  }
}

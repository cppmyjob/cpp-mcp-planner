import { TestBed } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HeaderComponent } from './header';

// Mock window.matchMedia for ThemeService
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

describe('HeaderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display application title', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.header__title')?.textContent).toContain('MCP Planning Dashboard');
  });

  it('should have theme toggle button', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const themeButton = compiled.querySelector('[data-testid="theme-toggle"]');
    expect(themeButton).toBeTruthy();
  });

  it('should toggle theme on button click', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const initialTheme = component.isDarkTheme;

    // Click toggle - need to find button inside p-button wrapper
    const themeButton = fixture.nativeElement.querySelector('[data-testid="theme-toggle"] button');
    themeButton?.click();
    fixture.detectChanges();

    expect(component.isDarkTheme).toBe(!initialTheme);
  });

  it('should have sidebar toggle button', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const sidebarToggle = compiled.querySelector('[data-testid="sidebar-toggle"]');
    expect(sidebarToggle).toBeTruthy();
  });

  it('should emit sidebarToggle event when sidebar button clicked', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const spy = vi.spyOn(component.sidebarToggle, 'emit');

    // Click button inside p-button wrapper
    const sidebarButton = fixture.nativeElement.querySelector('[data-testid="sidebar-toggle"] button');
    sidebarButton?.click();

    expect(spy).toHaveBeenCalled();
  });
});

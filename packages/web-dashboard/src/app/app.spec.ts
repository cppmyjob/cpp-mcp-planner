import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WEB_SERVER_PORT } from '@mcp-planner/config/client';
import { AppComponent } from './app';
import { API_BASE_URL } from './core/services/api/api.service';

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

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let httpMock: HttpTestingController;
  const baseUrl = `http://localhost:${WEB_SERVER_PORT}/api`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AppComponent);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushRequests(): void {
    httpMock.match(() => true).forEach(req => req.flush({ plans: [], total: 0, hasMore: false }));
  }

  it('should create the app', () => {
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    flushRequests();
  });

  it('should render header', () => {
    fixture.detectChanges();
    flushRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-header')).toBeTruthy();
  });

  it('should render sidebar', () => {
    fixture.detectChanges();
    flushRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-sidebar')).toBeTruthy();
  });

  it('should render main content area', () => {
    fixture.detectChanges();
    flushRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-shell__main')).toBeTruthy();
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('should toggle sidebar collapsed state', () => {
    fixture.detectChanges();
    flushRequests();

    const component = fixture.componentInstance;
    expect(component.sidebarCollapsed()).toBe(false);

    component.toggleSidebar();
    expect(component.sidebarCollapsed()).toBe(true);

    component.toggleSidebar();
    expect(component.sidebarCollapsed()).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let localStorageMock: Map<string, string>;
  let documentElement: HTMLElement;

  beforeEach(() => {
    // Mock localStorage
    localStorageMock = new Map<string, string>();

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return localStorageMock.get(key) ?? null;
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      localStorageMock.set(key, value);
    });

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // Store reference to documentElement
    documentElement = document.documentElement;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ThemeService]
    });

    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    // Clean up
    localStorageMock.clear();
    vi.restoreAllMocks();
    documentElement.classList.remove('dark-theme');
  });

  describe('initialization', () => {
    it('should create the service', () => {
      // Assert
      expect(service).toBeTruthy();
    });

    it('should default to light theme when localStorage is empty and system prefers light', () => {
      // Arrange - localStorage is empty by default, matchMedia returns false (light)

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ThemeService]
      });
      const newService = TestBed.inject(ThemeService);

      // Assert
      expect(newService.currentTheme()).toBe('light');
    });

    it('should default to dark theme when localStorage is empty and system prefers dark', () => {
      // Arrange
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: query === '(prefers-color-scheme: dark)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ThemeService]
      });
      const newService = TestBed.inject(ThemeService);

      // Assert
      expect(newService.currentTheme()).toBe('dark');
    });

    it('should load saved light theme from localStorage', () => {
      // Arrange
      localStorageMock.set('app-theme', 'light');

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ThemeService]
      });
      const newService = TestBed.inject(ThemeService);

      // Assert
      expect(newService.currentTheme()).toBe('light');
    });

    it('should load saved dark theme from localStorage', () => {
      // Arrange
      localStorageMock.set('app-theme', 'dark');

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ThemeService]
      });
      const newService = TestBed.inject(ThemeService);

      // Assert
      expect(newService.currentTheme()).toBe('dark');
    });

    it('should ignore invalid theme value in localStorage', () => {
      // Arrange
      localStorageMock.set('app-theme', 'invalid-theme');

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ThemeService]
      });
      const newService = TestBed.inject(ThemeService);

      // Assert
      expect(newService.currentTheme()).toBe('light');
    });
  });

  describe('setTheme', () => {
    it('should update currentTheme signal when theme is set to dark', () => {
      // Arrange
      expect(service.currentTheme()).toBe('light');

      // Act
      service.setTheme('dark');

      // Assert
      expect(service.currentTheme()).toBe('dark');
    });

    it('should update currentTheme signal when theme is set to light', () => {
      // Arrange
      service.setTheme('dark');
      expect(service.currentTheme()).toBe('dark');

      // Act
      service.setTheme('light');

      // Assert
      expect(service.currentTheme()).toBe('light');
    });

    it('should persist theme to localStorage when set to dark', () => {
      // Act
      service.setTheme('dark');

      // Assert
      expect(localStorageMock.get('app-theme')).toBe('dark');
    });

    it('should persist theme to localStorage when set to light', () => {
      // Arrange
      service.setTheme('dark');

      // Act
      service.setTheme('light');

      // Assert
      expect(localStorageMock.get('app-theme')).toBe('light');
    });

    it('should apply dark-theme class to documentElement when set to dark', () => {
      // Act
      service.setTheme('dark');

      // Wait for effect to run
      TestBed.flushEffects();

      // Assert
      expect(documentElement.classList.contains('dark-theme')).toBe(true);
    });

    it('should remove dark-theme class from documentElement when set to light', () => {
      // Arrange
      service.setTheme('dark');
      TestBed.flushEffects();
      expect(documentElement.classList.contains('dark-theme')).toBe(true);

      // Act
      service.setTheme('light');
      TestBed.flushEffects();

      // Assert
      expect(documentElement.classList.contains('dark-theme')).toBe(false);
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from light to dark', () => {
      // Arrange
      expect(service.currentTheme()).toBe('light');

      // Act
      service.toggleTheme();

      // Assert
      expect(service.currentTheme()).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      // Arrange
      service.setTheme('dark');
      expect(service.currentTheme()).toBe('dark');

      // Act
      service.toggleTheme();

      // Assert
      expect(service.currentTheme()).toBe('light');
    });

    it('should persist toggled theme to localStorage', () => {
      // Act
      service.toggleTheme(); // light -> dark

      // Assert
      expect(localStorageMock.get('app-theme')).toBe('dark');

      // Act
      service.toggleTheme(); // dark -> light

      // Assert
      expect(localStorageMock.get('app-theme')).toBe('light');
    });

    it('should apply CSS class when toggling to dark', () => {
      // Act
      service.toggleTheme(); // light -> dark
      TestBed.flushEffects();

      // Assert
      expect(documentElement.classList.contains('dark-theme')).toBe(true);
    });

    it('should remove CSS class when toggling to light', () => {
      // Arrange
      service.setTheme('dark');
      TestBed.flushEffects();

      // Act
      service.toggleTheme(); // dark -> light
      TestBed.flushEffects();

      // Assert
      expect(documentElement.classList.contains('dark-theme')).toBe(false);
    });
  });

  describe('reactive updates', () => {
    it('should reactively update when theme changes', () => {
      // Arrange
      const initialTheme = service.currentTheme();
      expect(initialTheme).toBe('light');

      // Act
      service.setTheme('dark');
      const darkTheme = service.currentTheme();

      service.setTheme('light');
      const lightTheme = service.currentTheme();

      // Assert
      expect(darkTheme).toBe('dark');
      expect(lightTheme).toBe('light');
    });
  });

  describe('localStorage persistence', () => {
    it('should persist theme across service instances', () => {
      // Arrange
      service.setTheme('dark');

      // Act - Create new service instance
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ThemeService]
      });
      const newService = TestBed.inject(ThemeService);

      // Assert
      expect(newService.currentTheme()).toBe('dark');
    });

    it('should overwrite existing localStorage value when setting new theme', () => {
      // Arrange
      service.setTheme('dark');
      expect(localStorageMock.get('app-theme')).toBe('dark');

      // Act
      service.setTheme('light');

      // Assert
      expect(localStorageMock.get('app-theme')).toBe('light');
    });
  });
});

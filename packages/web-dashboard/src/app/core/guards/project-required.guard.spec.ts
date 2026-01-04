/**
 * GREEN: Phase 4.14 - Tests for projectRequiredGuard
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { projectRequiredGuard } from './project-required.guard';
import { ProjectStateService } from '../services';

describe('projectRequiredGuard', () => {
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let hasActiveProjectSignal: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    // Create signal for mocking hasActiveProject
    hasActiveProjectSignal = signal(false);

    // Mock Router
    mockRouter = {
      navigate: vi.fn()
    };

    // Mock ProjectStateService
    const mockProjectStateService = {
      hasActiveProject: () => hasActiveProjectSignal()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: ProjectStateService, useValue: mockProjectStateService }
      ]
    });
  });

  describe('when project is active', () => {
    it('should allow navigation when hasActiveProject returns true', () => {
      // Arrange
      hasActiveProjectSignal.set(true);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act
      const result = TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));

      // Assert
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('when project is not active', () => {
    it('should block navigation when hasActiveProject returns false', () => {
      // Arrange
      hasActiveProjectSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act
      const result = TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));

      // Assert
      expect(result).toBe(false);
    });

    it('should redirect to root with returnUrl when hasActiveProject returns false', () => {
      // Arrange
      hasActiveProjectSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act
      TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    });

    it('should redirect exactly once when blocking navigation', () => {
      // Arrange
      hasActiveProjectSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/phases' } as any;

      // Act
      TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('state transitions', () => {
    it('should allow navigation after project becomes active', () => {
      // Arrange - Start without project
      hasActiveProjectSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act & Assert - First attempt blocked
      let result1 = TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));
      expect(result1).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);

      // Arrange - Project becomes active
      hasActiveProjectSignal.set(true);
      mockRouter.navigate.mockClear();

      // Act & Assert - Second attempt allowed
      let result2 = TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));
      expect(result2).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should block navigation after project becomes inactive', () => {
      // Arrange - Start with project
      hasActiveProjectSignal.set(true);
      const mockRoute = {} as any;
      const mockState = { url: '/requirements' } as any;

      // Act & Assert - First attempt allowed
      let result1 = TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));
      expect(result1).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();

      // Arrange - Project becomes inactive
      hasActiveProjectSignal.set(false);

      // Act & Assert - Second attempt blocked
      let result2 = TestBed.runInInjectionContext(() => projectRequiredGuard(mockRoute, mockState));
      expect(result2).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { returnUrl: '/requirements' }
      });
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanStateService } from './plan-state.service';

describe('PlanStateService', () => {
  let service: PlanStateService;
  let localStorageMock: Map<string, string>;
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;
  let removeItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Mock localStorage
    localStorageMock = new Map<string, string>();

    getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return localStorageMock.get(key) ?? null;
    });

    setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      localStorageMock.set(key, value);
    });

    removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      localStorageMock.delete(key);
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [PlanStateService]
    });

    service = TestBed.inject(PlanStateService);
  });

  afterEach(() => {
    // Clean up
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create the service', () => {
      // Assert
      expect(service).toBeTruthy();
    });

    it('should load saved plan ID from localStorage on construction when available', () => {
      // Arrange
      const savedPlanId = 'test-plan-123';
      localStorageMock.set('active-plan-id', savedPlanId);

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [PlanStateService]
      });
      const newService = TestBed.inject(PlanStateService);

      // Assert
      expect(newService.activePlanId()).toBe(savedPlanId);
    });

    it('should use default plan ID when localStorage is empty on construction', () => {
      // Arrange - localStorage is empty by default in beforeEach

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [PlanStateService]
      });
      const newService = TestBed.inject(PlanStateService);

      // Assert
      expect(newService.activePlanId()).toBe('261825f1-cef0-4227-873c-a20c7e81a9de');
    });
  });

  describe('setActivePlan', () => {
    it('should update activePlanId signal when plan is set', () => {
      // Arrange
      const testPlanId = 'new-plan-456';

      // Act
      service.setActivePlan(testPlanId);

      // Assert
      expect(service.activePlanId()).toBe(testPlanId);
    });

    it('should persist plan ID to localStorage when plan is set', () => {
      // Arrange
      const testPlanId = 'persistent-plan-789';

      // Act
      service.setActivePlan(testPlanId);

      // Assert
      expect(setItemSpy).toHaveBeenCalledWith('active-plan-id', testPlanId);
      expect(localStorageMock.get('active-plan-id')).toBe(testPlanId);
    });

    it('should update hasActivePlan to true when plan is set', () => {
      // Arrange
      const testPlanId = 'has-plan-abc';

      // Act
      service.setActivePlan(testPlanId);

      // Assert
      expect(service.hasActivePlan()).toBe(true);
    });
  });

  describe('clearActivePlan', () => {
    it('should set activePlanId signal to null when plan is cleared', () => {
      // Arrange
      service.setActivePlan('some-plan-id');

      // Act
      service.clearActivePlan();

      // Assert
      expect(service.activePlanId()).toBe('261825f1-cef0-4227-873c-a20c7e81a9de'); // Should return default
    });

    it('should remove plan ID from localStorage when plan is cleared', () => {
      // Arrange
      service.setActivePlan('plan-to-remove');

      // Act
      service.clearActivePlan();

      // Assert
      expect(removeItemSpy).toHaveBeenCalledWith('active-plan-id');
      expect(localStorageMock.has('active-plan-id')).toBe(false);
    });

    it('should update hasActivePlan to false when plan is cleared', () => {
      // Arrange
      service.setActivePlan('temporary-plan');

      // Act
      service.clearActivePlan();

      // Assert
      expect(service.hasActivePlan()).toBe(false);
    });
  });

  describe('activePlanId computed', () => {
    it('should return current plan ID when explicitly set', () => {
      // Arrange
      const explicitPlanId = 'explicit-123';

      // Act
      service.setActivePlan(explicitPlanId);

      // Assert
      expect(service.activePlanId()).toBe(explicitPlanId);
    });

    it('should return default plan ID when no plan is set', () => {
      // Arrange - service initialized with empty localStorage

      // Act
      service.clearActivePlan();

      // Assert
      expect(service.activePlanId()).toBe('261825f1-cef0-4227-873c-a20c7e81a9de');
    });

    it('should reactively update when underlying signal changes', () => {
      // Arrange
      const firstPlanId = 'first-plan';
      const secondPlanId = 'second-plan';

      // Act
      service.setActivePlan(firstPlanId);
      const firstValue = service.activePlanId();

      service.setActivePlan(secondPlanId);
      const secondValue = service.activePlanId();

      // Assert
      expect(firstValue).toBe(firstPlanId);
      expect(secondValue).toBe(secondPlanId);
    });
  });

  describe('hasActivePlan computed', () => {
    it('should return true when a plan ID is explicitly set', () => {
      // Arrange
      const planId = 'has-plan-true';

      // Act
      service.setActivePlan(planId);

      // Assert
      expect(service.hasActivePlan()).toBe(true);
    });

    it('should return false when plan is cleared', () => {
      // Arrange
      service.setActivePlan('will-be-cleared');

      // Act
      service.clearActivePlan();

      // Assert
      expect(service.hasActivePlan()).toBe(false);
    });

    it('should return false on initial state with empty localStorage', () => {
      // Arrange - clean service initialization
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [PlanStateService]
      });
      const cleanService = TestBed.inject(PlanStateService);

      // Assert
      expect(cleanService.hasActivePlan()).toBe(false);
    });

    it('should reactively update when plan state changes', () => {
      // Arrange
      const planId = 'reactive-plan';

      // Act & Assert
      expect(service.hasActivePlan()).toBe(false);

      service.setActivePlan(planId);
      expect(service.hasActivePlan()).toBe(true);

      service.clearActivePlan();
      expect(service.hasActivePlan()).toBe(false);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist plan ID across service instances', () => {
      // Arrange
      const persistentPlanId = 'cross-instance-plan';

      // Act
      service.setActivePlan(persistentPlanId);

      // Create new service instance
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [PlanStateService]
      });
      const newService = TestBed.inject(PlanStateService);

      // Assert
      expect(newService.activePlanId()).toBe(persistentPlanId);
    });

    it('should handle missing localStorage entry gracefully', () => {
      // Arrange - localStorage is empty

      // Act
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [PlanStateService]
      });
      const newService = TestBed.inject(PlanStateService);

      // Assert
      expect(newService.activePlanId()).toBe('261825f1-cef0-4227-873c-a20c7e81a9de');
      expect(newService.hasActivePlan()).toBe(false);
    });

    it('should overwrite existing localStorage value when setting new plan', () => {
      // Arrange
      const oldPlanId = 'old-plan';
      const newPlanId = 'new-plan';

      // Act
      service.setActivePlan(oldPlanId);
      service.setActivePlan(newPlanId);

      // Assert
      expect(localStorageMock.get('active-plan-id')).toBe(newPlanId);
      expect(service.activePlanId()).toBe(newPlanId);
    });
  });
});

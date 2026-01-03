/**
 * RED: Phase 4.1.2 - Tests for ProjectStateService without defaultProjectId
 *
 * These tests verify the new behavior after removing defaultProjectId:
 * - activeProjectId() returns null when no project is set (not 'default')
 * - hasActiveProject() returns false when activeProjectId is null
 * - clearActiveProject() results in null activeProjectId (not 'default')
 * - localStorage integration works correctly
 */

import { TestBed } from '@angular/core/testing';
import { ProjectStateService } from './project-state.service';

describe('ProjectStateService', () => {
  let service: ProjectStateService;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    TestBed.configureTestingModule({});
    service = TestBed.inject(ProjectStateService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('RED: should return null when no project is set (not default)', () => {
      // RED: Currently returns 'default', should return null
      expect(service.activeProjectId()).toBeNull();
    });

    it('RED: should return false for hasActiveProject when no project is set', () => {
      // RED: Currently returns true (because of defaultProjectId), should return false
      expect(service.hasActiveProject()).toBe(false);
    });
  });

  describe('setActiveProject', () => {
    it('should set active project ID', () => {
      const projectId = 'test-project-123';

      service.setActiveProject(projectId);

      expect(service.activeProjectId()).toBe(projectId);
      expect(service.hasActiveProject()).toBe(true);
    });

    it('should persist active project to localStorage', () => {
      const projectId = 'test-project-456';

      service.setActiveProject(projectId);

      const saved = localStorage.getItem('active-project-id');
      expect(saved).toBe(projectId);
    });

    it('should update hasActiveProject to true', () => {
      service.setActiveProject('project-789');

      expect(service.hasActiveProject()).toBe(true);
    });
  });

  describe('clearActiveProject', () => {
    it('RED: should set activeProjectId to null (not default)', () => {
      service.setActiveProject('test-project');

      service.clearActiveProject();

      // RED: Currently returns 'default', should return null
      expect(service.activeProjectId()).toBeNull();
    });

    it('should set hasActiveProject to false', () => {
      service.setActiveProject('test-project');

      service.clearActiveProject();

      expect(service.hasActiveProject()).toBe(false);
    });

    it('should remove project from localStorage', () => {
      service.setActiveProject('test-project');
      expect(localStorage.getItem('active-project-id')).toBeTruthy();

      service.clearActiveProject();

      expect(localStorage.getItem('active-project-id')).toBeNull();
    });
  });

  describe('localStorage persistence', () => {
    it('should load activeProjectId from localStorage on initialization', () => {
      const projectId = 'persisted-project';
      localStorage.setItem('active-project-id', projectId);

      // Reset TestBed and create new service instance to trigger loadActiveProject()
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ProjectStateService);

      expect(newService.activeProjectId()).toBe(projectId);
      expect(newService.hasActiveProject()).toBe(true);
    });

    it('RED: should return null when localStorage is empty (not default)', () => {
      localStorage.clear();

      // Reset TestBed and create new service instance
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(ProjectStateService);

      // RED: Currently returns 'default', should return null
      expect(newService.activeProjectId()).toBeNull();
      expect(newService.hasActiveProject()).toBe(false);
    });
  });

  describe('signal reactivity', () => {
    it('should update computed signal when activeProjectId changes', () => {
      const projectId1 = 'project-1';
      const projectId2 = 'project-2';

      service.setActiveProject(projectId1);
      expect(service.activeProjectId()).toBe(projectId1);

      service.setActiveProject(projectId2);
      expect(service.activeProjectId()).toBe(projectId2);
    });

    it('should update hasActiveProject when clearing project', () => {
      service.setActiveProject('test-project');
      expect(service.hasActiveProject()).toBe(true);

      service.clearActiveProject();
      expect(service.hasActiveProject()).toBe(false);
    });
  });
});

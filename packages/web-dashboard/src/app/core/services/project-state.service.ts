import { Injectable, signal, computed } from '@angular/core';

/**
 * GREEN: Phase 4.1.3 - Global state service for active project management.
 * Uses Angular Signals for reactive state.
 *
 * BREAKING CHANGE: activeProjectId() now returns string | null instead of string.
 * All consumers must add null-guards before accessing.
 */
@Injectable({
  providedIn: 'root'
})
export class ProjectStateService {
  public readonly activeProjectId = computed(() => this.activeProjectIdSignal());
  public readonly hasActiveProject = computed(() => this.activeProjectIdSignal() !== null);

  private readonly activeProjectIdSignal = signal<string | null>(null);
  private readonly projectStorageKey = 'active-project-id';

  constructor() {
    this.loadActiveProject();
  }

  public setActiveProject(projectId: string): void {
    this.activeProjectIdSignal.set(projectId);
    this.saveActiveProject(projectId);
  }

  public clearActiveProject(): void {
    this.activeProjectIdSignal.set(null);
    localStorage.removeItem(this.projectStorageKey);
  }

  private loadActiveProject(): void {
    const savedProjectId = localStorage.getItem(this.projectStorageKey);
    if (savedProjectId) {
      this.activeProjectIdSignal.set(savedProjectId);
    }
  }

  private saveActiveProject(projectId: string): void {
    localStorage.setItem(this.projectStorageKey, projectId);
  }
}

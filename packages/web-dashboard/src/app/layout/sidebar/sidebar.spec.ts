import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Component } from '@angular/core';
import { SidebarComponent } from './sidebar';

// Host component to test input binding
@Component({
  selector: 'app-test-host',
  imports: [SidebarComponent],
  template: `<app-sidebar [collapsed]="isCollapsed" />`
})
class TestHostComponent {
  public isCollapsed = false;
}

describe('SidebarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent, TestHostComponent],
      providers: [
        provideRouter([])
      ]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should have navigation menu items', () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Should have main navigation items
    expect(compiled.textContent).toContain('Dashboard');
    expect(compiled.textContent).toContain('Requirements');
    expect(compiled.textContent).toContain('Solutions');
    expect(compiled.textContent).toContain('Decisions');
    expect(compiled.textContent).toContain('Phases');
    expect(compiled.textContent).toContain('Artifacts');
  });

  it('should show collapsed state when collapsed input is true', () => {
    const fixture: ComponentFixture<TestHostComponent> = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.isCollapsed = true;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const sidebar = compiled.querySelector('.sidebar');
    expect(sidebar?.classList.contains('sidebar--collapsed')).toBe(true);
  });
});

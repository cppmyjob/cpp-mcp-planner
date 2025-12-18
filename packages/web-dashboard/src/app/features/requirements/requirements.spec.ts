import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { RequirementsComponent } from './requirements';

describe('RequirementsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequirementsComponent]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(RequirementsComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display requirements title', () => {
    const fixture = TestBed.createComponent(RequirementsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.requirements__title')?.textContent).toContain('Requirements');
  });

  it('should have data-testid for e2e testing', () => {
    const fixture = TestBed.createComponent(RequirementsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="requirements-page"]')).toBeTruthy();
  });
});

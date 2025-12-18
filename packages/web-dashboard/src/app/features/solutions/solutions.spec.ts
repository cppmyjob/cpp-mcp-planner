import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { SolutionsComponent } from './solutions';

describe('SolutionsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SolutionsComponent]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(SolutionsComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display solutions title', () => {
    const fixture = TestBed.createComponent(SolutionsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.solutions__title')?.textContent).toContain('Solutions');
  });

  it('should have data-testid for e2e testing', () => {
    const fixture = TestBed.createComponent(SolutionsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="solutions-page"]')).toBeTruthy();
  });
});

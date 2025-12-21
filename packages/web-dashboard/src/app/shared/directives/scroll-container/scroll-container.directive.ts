import {
  Directive,
  ElementRef,
  input,
  output,
  signal,
  effect,
  DestroyRef,
  inject
} from '@angular/core';
import { throttle } from '../../utils/throttle';
import { ScrollState, ScrollContainerConfig } from './scroll-container.types';

/**
 * Directive for tracking scroll state and applying overflow indicator classes
 *
 * Automatically adds BEM classes:
 * - `scroll-container--overflow-top` - when scrolled down from top
 * - `scroll-container--overflow-bottom` - when content overflows bottom
 * - `scroll-container--overflow-left` - when scrolled right from left (if horizontal enabled)
 * - `scroll-container--overflow-right` - when content overflows right (if horizontal enabled)
 *
 * @example
 * <div scrollContainer
 *      [threshold]="10"
 *      [enableHorizontal]="true"
 *      (scrollStateChange)="onScrollChange($event)">
 *   Content...
 * </div>
 */
@Directive({
  selector: '[scrollContainer]',
  standalone: true
})
export class ScrollContainerDirective {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  // Input configuration
  public readonly threshold = input<number>(10);
  public readonly throttleDelay = input<number>(16);
  public readonly enableHorizontal = input<boolean>(false);
  public readonly enableVertical = input<boolean>(true);

  // Output events
  public readonly scrollStateChange = output<ScrollState>();

  // Public signal for programmatic access
  public readonly scrollState = signal<ScrollState>({
    hasOverflowTop: false,
    hasOverflowBottom: false,
    hasOverflowLeft: false,
    hasOverflowRight: false
  });

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private scrollHandler?: () => void;

  constructor() {
    effect(() => {
      // Reinitialize when configuration changes
      const config: ScrollContainerConfig = {
        threshold: this.threshold(),
        throttleDelay: this.throttleDelay(),
        enableHorizontal: this.enableHorizontal(),
        enableVertical: this.enableVertical()
      };
      this.initializeScrollTracking(config);
    });
  }

  private initializeScrollTracking(config: ScrollContainerConfig): void {
    const element = this.elementRef.nativeElement;

    // Cleanup previous observers if any
    this.cleanup();

    // Update scroll state function - uses direct DOM manipulation for performance
    const updateScrollState = () => {
      const state: ScrollState = {
        hasOverflowTop: false,
        hasOverflowBottom: false,
        hasOverflowLeft: false,
        hasOverflowRight: false
      };

      const thresholdValue = config.threshold ?? 10;

      // Vertical scroll detection
      if (config.enableVertical ?? true) {
        state.hasOverflowTop = element.scrollTop > thresholdValue;
        state.hasOverflowBottom =
          element.scrollHeight - element.scrollTop - element.clientHeight >
          thresholdValue;

        // Update DOM classes directly for performance
        element.classList.toggle('scroll-container--overflow-top', state.hasOverflowTop);
        element.classList.toggle('scroll-container--overflow-bottom', state.hasOverflowBottom);
      }

      // Horizontal scroll detection
      if (config.enableHorizontal ?? false) {
        state.hasOverflowLeft = element.scrollLeft > thresholdValue;
        state.hasOverflowRight =
          element.scrollWidth - element.scrollLeft - element.clientWidth >
          thresholdValue;

        // Update DOM classes directly for performance
        element.classList.toggle('scroll-container--overflow-left', state.hasOverflowLeft);
        element.classList.toggle('scroll-container--overflow-right', state.hasOverflowRight);
      }

      // Update signal and emit event
      this.scrollState.set(state);
      this.scrollStateChange.emit(state);
    };

    // Throttled version for performance
    const throttleDelayValue = config.throttleDelay ?? 16;
    this.scrollHandler = throttle(updateScrollState, throttleDelayValue);

    // Attach scroll listener
    element.addEventListener('scroll', this.scrollHandler, { passive: true });

    // ResizeObserver for window resize
    this.resizeObserver = new ResizeObserver(() => {
      if (this.scrollHandler) {
        this.scrollHandler();
      }
    });
    this.resizeObserver.observe(element);

    // MutationObserver for detecting content changes (adding/removing children)
    this.mutationObserver = new MutationObserver(() => {
      // Wait for layout recalc using requestAnimationFrame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateScrollState();
        });
      });
    });
    this.mutationObserver.observe(element, {
      childList: true,
      subtree: true
    });

    // Initial check immediately and after small delay for initial render
    updateScrollState();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateScrollState();
      });
    });

    // Register cleanup on destroy
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  private cleanup(): void {
    const element = this.elementRef.nativeElement;

    if (this.scrollHandler) {
      element.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = undefined;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = undefined;
    }

    // Remove all BEM classes
    element.classList.remove(
      'scroll-container--overflow-top',
      'scroll-container--overflow-bottom',
      'scroll-container--overflow-left',
      'scroll-container--overflow-right'
    );
  }
}

/**
 * Scroll state tracking for scroll containers
 */
export interface ScrollState {
  hasOverflowTop: boolean;
  hasOverflowBottom: boolean;
  hasOverflowLeft: boolean;
  hasOverflowRight: boolean;
}

/**
 * Configuration for scroll container directive
 */
export interface ScrollContainerConfig {
  /**
   * Scroll detection threshold in pixels
   * @default 10
   */
  threshold?: number;

  /**
   * Throttle delay in milliseconds (16ms = 60fps)
   * @default 16
   */
  throttleDelay?: number;

  /**
   * Enable horizontal scroll detection
   * @default false
   */
  enableHorizontal?: boolean;

  /**
   * Enable vertical scroll detection
   * @default true
   */
  enableVertical?: boolean;
}

/**
 * GREEN: Phase 2.11.3 - ProjectContextMiddleware
 *
 * NestJS middleware that:
 * 1. Extracts X-Project-Id from request headers
 * 2. Validates header presence (returns 400 if missing/empty)
 * 3. Sets AsyncLocalStorage context via runWithProjectContext()
 * 4. Calls next() within the context
 *
 * This middleware enables multi-project support in web-server by integrating
 * with core's AsyncLocalStorage-based project-context.ts.
 *
 * References:
 * - Decision 20: Hybrid Approach (native AsyncLocalStorage, no nestjs-cls needed)
 * - Decision 8: API Convention - X-Project-Id header
 */

import { Injectable, type NestMiddleware, BadRequestException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { runWithProjectContext } from '@mcp-planner/core';

/**
 * Middleware that extracts projectId from X-Project-Id header and sets AsyncLocalStorage context
 */
@Injectable()
export class ProjectContextMiddleware implements NestMiddleware {
  public use(req: Request, res: Response, next: NextFunction): void {
    const projectId = req.headers['x-project-id'] as string | undefined;

    // Validate header presence
    if (projectId === undefined || projectId.trim() === '') {
      throw new BadRequestException('X-Project-Id header is required');
    }

    // Set AsyncLocalStorage context and call next() within it
    // This ensures all async operations in the request lifecycle have access to projectId
    // Note: callback is synchronous, so runWithProjectContext returns synchronously
    void runWithProjectContext(projectId.trim(), () => {
      next();
    });
  }
}

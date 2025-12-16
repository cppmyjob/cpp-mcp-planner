import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';

import { ApiService } from './api.service';
import type {
  Link,
  CreateLinkDto,
  RelationType
} from '../models';

/**
 * Service for Link API operations
 */
@Injectable({
  providedIn: 'root'
})
export class LinkService {
  private readonly api = inject(ApiService);

  /**
   * Get links for entity
   */
  public getForEntity(
    planId: string,
    entityId: string,
    options?: { direction?: 'outgoing' | 'incoming' | 'both'; relationType?: RelationType }
  ): Observable<Link[]> {
    const params: Record<string, string> = { entityId };
    if (options?.direction) {
      params['direction'] = options.direction;
    }
    if (options?.relationType) {
      params['relationType'] = options.relationType;
    }
    return this.api.get<Link[]>(`/plans/${planId}/links`, params);
  }

  /**
   * Create new link
   */
  public create(planId: string, dto: CreateLinkDto): Observable<Link> {
    return this.api.post<Link>(`/plans/${planId}/links`, dto);
  }

  /**
   * Delete link
   */
  public delete(planId: string, linkId: string): Observable<void> {
    return this.api.delete<void>(`/plans/${planId}/links/${linkId}`);
  }
}

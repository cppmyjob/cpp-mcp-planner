import { Component, ViewEncapsulation, signal, computed, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SplitterModule } from 'primeng/splitter';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ScrollContainerDirective } from '../../shared/directives/scroll-container/scroll-container.directive';
import { ArtifactService } from '../../core/services/api/artifact.service';
import { PlanStateService } from '../../core/services/plan-state.service';
import type { Artifact, ArtifactType, ArtifactStatus } from '../../models';

interface SelectOption {
  label: string;
  value: ArtifactType | ArtifactStatus | null;
}

@Component({
  selector: 'app-artifacts',
  imports: [
    FormsModule,
    TableModule,
    TagModule,
    ButtonModule,
    SelectModule,
    SplitterModule,
    ProgressSpinnerModule,
    MessageModule,
    ToastModule,
    TooltipModule,
    ScrollContainerDirective
  ],
  providers: [MessageService],
  templateUrl: './artifacts.html',
  styleUrl: './artifacts.scss',
  encapsulation: ViewEncapsulation.None
})
export class ArtifactsComponent {
  // State signals
  public readonly loading = signal(true);
  public readonly error = signal<string | null>(null);
  public readonly artifacts = signal<Artifact[]>([]);
  public readonly selectedArtifact = signal<Artifact | null>(null);
  public readonly loadingContent = signal(false);

  // Filter signals
  public readonly selectedType = signal<ArtifactType | null>(null);
  public readonly selectedStatus = signal<ArtifactStatus | null>(null);

  // Computed: filtered artifacts
  public readonly filteredArtifacts = computed(() => {
    let result = this.artifacts();
    const type = this.selectedType();
    const status = this.selectedStatus();

    if (type) {
      result = result.filter(a => a.artifactType === type);
    }
    if (status) {
      result = result.filter(a => a.status === status);
    }

    return result;
  });

  // Filter options
  public readonly typeOptions: SelectOption[] = [
    { label: 'All Types', value: null },
    { label: 'Code', value: 'code' },
    { label: 'Config', value: 'config' },
    { label: 'Migration', value: 'migration' },
    { label: 'Documentation', value: 'documentation' },
    { label: 'Test', value: 'test' },
    { label: 'Script', value: 'script' },
    { label: 'Other', value: 'other' }
  ];

  public readonly statusOptions: SelectOption[] = [
    { label: 'All Statuses', value: null },
    { label: 'Draft', value: 'draft' },
    { label: 'Reviewed', value: 'reviewed' },
    { label: 'Approved', value: 'approved' },
    { label: 'Implemented', value: 'implemented' },
    { label: 'Outdated', value: 'outdated' }
  ];

  // Services
  private readonly artifactService = inject(ArtifactService);
  private readonly planState = inject(PlanStateService);
  private readonly messageService = inject(MessageService);

  public constructor() {
    effect(() => {
      const planId = this.planState.activePlanId();
      if (planId) {
        this.loadArtifacts(planId);
      } else {
        // No plan selected - show empty state
        this.loading.set(false);
        this.artifacts.set([]);
        this.selectedArtifact.set(null);
      }
    });
  }

  // Selection with lazy-load content
  public selectArtifact(artifact: Artifact): void {
    // Deselect if clicking same artifact
    if (this.selectedArtifact()?.id === artifact.id) {
      this.selectedArtifact.set(null);
      return;
    }

    const planId = this.planState.activePlanId();
    if (!planId) return;

    this.loadingContent.set(true);
    this.artifactService.get(planId, artifact.id, { includeContent: true }).subscribe({
      next: (fullArtifact) => {
        this.selectedArtifact.set(fullArtifact);
        this.loadingContent.set(false);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load artifact content'
        });
        this.loadingContent.set(false);
      }
    });
  }

  // Helper: generate short artifact ID
  public getArtifactId(artifact: Artifact): string {
    return `ART-${artifact.id.substring(0, 3).toUpperCase()}`;
  }

  // Helper: get status severity for p-tag
  public getStatusSeverity(status: ArtifactStatus): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const map: Record<ArtifactStatus, 'success' | 'info' | 'warn' | 'danger' | 'secondary'> = {
      'implemented': 'success',
      'approved': 'info',
      'reviewed': 'info',
      'draft': 'secondary',
      'outdated': 'warn'
    };
    return map[status];
  }

  // Helper: get type icon
  public getTypeIcon(type: ArtifactType): string {
    const map: Record<ArtifactType, string> = {
      'code': 'pi-code',
      'config': 'pi-cog',
      'migration': 'pi-database',
      'documentation': 'pi-file',
      'test': 'pi-check-circle',
      'script': 'pi-bolt',
      'other': 'pi-folder'
    };
    return map[type];
  }

  // Helper: format phase ID for display
  public formatPhaseId(artifact: Artifact): string {
    if (!artifact.relatedPhaseId) {
      return '-';
    }
    return artifact.relatedPhaseId.substring(0, 4);
  }

  // Helper: check if artifact has content
  public hasContent(artifact: Artifact): boolean {
    return Boolean(artifact.content?.sourceCode);
  }

  // Helper: check if artifact has targets
  public hasTargets(artifact: Artifact): boolean {
    return Boolean(artifact.targets?.length);
  }

  // Helper: check if artifact has description
  public hasDescription(artifact: Artifact): boolean {
    return Boolean(artifact.description);
  }

  // Copy code to clipboard
  public copyCode(): void {
    const code = this.selectedArtifact()?.content?.sourceCode;
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        this.messageService.add({
          severity: 'success',
          summary: 'Copied',
          detail: 'Code copied to clipboard'
        });
      }).catch(() => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to copy code'
        });
      });
    }
  }

  // Load artifacts from API
  private loadArtifacts(planId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.artifactService.list(planId).subscribe({
      next: (artifacts) => {
        this.artifacts.set(artifacts);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load artifacts');
        this.loading.set(false);
      }
    });
  }
}

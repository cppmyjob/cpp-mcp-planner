import { Component, ViewEncapsulation, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

// Services and Models
import { ProjectService } from '../../../core/services';
import type { InitProjectDto } from '../../../models';

@Component({
  selector: 'app-project-init-dialog',
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule
  ],
  templateUrl: './project-init-dialog.html',
  styleUrl: './project-init-dialog.scss',
  encapsulation: ViewEncapsulation.None
})
export class ProjectInitDialogComponent {
  public readonly visible = signal(false);
  public readonly loading = signal(false);
  public readonly projectId = signal('');
  public readonly workspacePath = signal('');
  public readonly error = signal<string | null>(null);

  public readonly projectCreated = output<string>();

  private readonly projectService = inject(ProjectService);

  public show(): void {
    this.visible.set(true);
    this.resetForm();
  }

  public hide(): void {
    this.visible.set(false);
    this.resetForm();
  }

  public onSubmit(): void {
    if (!this.isValid()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const dto: InitProjectDto = {
      projectId: this.projectId(),
      workspacePath: this.workspacePath()
    };

    this.projectService.init(dto).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.projectCreated.emit(response.projectId);
        this.hide();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.message ?? 'Failed to create project');
      }
    });
  }

  public isValid(): boolean {
    return this.projectId().trim().length > 0 && this.workspacePath().trim().length > 0;
  }

  private resetForm(): void {
    this.projectId.set('');
    this.workspacePath.set('');
    this.error.set(null);
    this.loading.set(false);
  }
}

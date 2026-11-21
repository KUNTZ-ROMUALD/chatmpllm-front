import {Component, EventEmitter, Input, Output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSelectModule} from '@angular/material/select';
import {ProviderRead,ProviderReadModel} from '../../providers/provider.models';

@Component({
  selector: 'app-provider-model-selector',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './provider-model-selector.html',
  styleUrl: './provider-model-selector.scss',
})
export class ProviderModelSelector {
  @Input() providers: readonly ProviderRead[] = [];
  @Input() models: readonly ProviderReadModel[] = [];
  @Input() selectedProviderId: string | null = null;
  @Input() selectedModelId: string | null = null;
  @Input() isProvidersLoading = false;
  @Input() isModelsLoading = false;
  @Input() providersError: string | null = null;
  @Input() modelsError: string | null = null;

  @Output() readonly providerChange = new EventEmitter<string | null>();
  @Output() readonly modelChange = new EventEmitter<string | null>();
  @Output() readonly retryProviders = new EventEmitter<void>();
  @Output() readonly retryModels = new EventEmitter<void>();
  @Input() disabled = false;

  onProviderSelectionChange(value: unknown): void {
    if (value === null || typeof value === 'string') {
      this.providerChange.emit(value);
    }
  }

  onModelSelectionChange(value: unknown): void {
    if (value === null || typeof value === 'string') {
      this.modelChange.emit(value);
    }
  }
}

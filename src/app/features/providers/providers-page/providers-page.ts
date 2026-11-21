import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatRippleModule } from '@angular/material/core';
import { ChatConversationService } from '../../chat/chat-conversation.service';

import { ProvidersApiService } from '../providers-api.service';
import { ProviderRead, ProviderReadModel } from '../provider.models';
import { ChatStateService } from '../../chat/chat-state.service';
import { SessionService } from '../../../core/auth/session.service';

interface ProviderWithModels {
  provider: ProviderRead;
  models: ProviderReadModel[];
  isExpanded: boolean;
}

@Component({
  selector: 'app-providers-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatRippleModule,
  ],
  templateUrl: './providers-page.html',
  styleUrl: './providers-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProvidersPage implements OnInit {
  private readonly providersApi = inject(ProvidersApiService);
  private readonly chatState = inject(ChatStateService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatConversation = inject(ChatConversationService);

  readonly isAuthenticated = computed(() => this.sessionService.isAuthenticated());

  readonly isLoading = signal(true);
  readonly pageError = signal<string | null>(null);
  readonly providersWithModels = signal<ProviderWithModels[]>([]);

  readonly selectedProviderId = signal<string | null>(null);
  readonly selectedModelId = signal<string | null>(null);

  readonly selectedProvider = computed(() => {
    const id = this.selectedProviderId();
    return this.providersWithModels().find(p => p.provider.id === id) ?? null;
  });

  readonly selectedModel = computed(() => {
    const prov = this.selectedProvider();
    const modelId = this.selectedModelId();
    if (!prov || !modelId) return null;
    return prov.models.find(m => m.id === modelId) ?? null;
  });

  readonly canConfirmSelection = computed(() => {
    const provider = this.selectedProvider()?.provider;
    const model = this.selectedModel();

    return (
      provider !== null &&
      provider !== undefined &&
      provider.is_active &&
      model !== null &&
      model.is_active &&
      model.provider_id === provider.id
    );
  });

  ngOnInit(): void {
    // Restore current selection from chat state
    const existing = this.chatState.getSelection('global');
    if (existing.providerId) this.selectedProviderId.set(existing.providerId);
    if (existing.modelId) this.selectedModelId.set(existing.modelId);

    this.loadProviders();
  }

  toggleProvider(pw: ProviderWithModels): void {
    this.providersWithModels.update(list =>
      list.map(item =>
        item.provider.id === pw.provider.id
          ? { ...item, isExpanded: !item.isExpanded }
          : item
      )
    );
  }

  selectProvider(provider: ProviderRead): void {
    if (this.selectedProviderId() === provider.id) return;
    this.selectedProviderId.set(provider.id);
    this.selectedModelId.set(null);
    this.providersWithModels.update(list =>
      list.map(item =>
        item.provider.id === provider.id
          ? { ...item, isExpanded: true }
          : item
      )
    );
  }

  selectModel(model: ProviderReadModel): void {
    this.selectedProviderId.set(model.provider_id);
    this.selectedModelId.set(model.id);
  }

  isModelSelected(model: ProviderReadModel): boolean {
    return this.selectedModelId() === model.id;
  }

  isProviderSelected(provider: ProviderRead): boolean {
    return this.selectedProviderId() === provider.id;
  }

  confirmSelection(): void {
    const provider = this.selectedProvider()?.provider;
    const model = this.selectedModel();

    if (
      provider === null ||
      provider === undefined ||
      model === null ||
      !provider.is_active ||
      !model.is_active ||
      model.provider_id !== provider.id
    ) {
      return;
    }

    // Le prochain envoi doit créer une nouvelle conversation avec ces choix,
    // et non réutiliser le conversationId de la conversation précédente.
    this.chatConversation.resetToDraft();

    this.chatState.setSelection('global', {
      providerId: provider.id,
      modelId: model.id,
    });

    void this.router.navigate(['/chat'], {
      queryParams: {},
    });
  }

  goBack(): void {
    this.router.navigate(['/chat']);
  }

  private loadProviders(): void {
    this.isLoading.set(true);
    this.pageError.set(null);

    this.providersApi
      .getProviders()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (providers) => {
          const active = providers.filter(p => p.is_active);
          // Load models for all providers in parallel
          if (active.length === 0) {
            this.providersWithModels.set([]);
            this.isLoading.set(false);
            return;
          }

          const modelRequests = active.map(p =>
            this.providersApi.getProviderModels(p.id)
          );

          forkJoin(modelRequests)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (modelsArrays) => {
                const list: ProviderWithModels[] = active.map((p, i) => ({
                  provider: p,
                  models: modelsArrays[i].filter(m => m.is_active),
                  isExpanded: this.selectedProviderId() === p.id || i === 0,
                }));
                this.providersWithModels.set(list);

                // Auto-select first provider/model if nothing selected
                if (!this.selectedProviderId() && list.length > 0) {
                  this.selectedProviderId.set(list[0].provider.id);
                  if (list[0].models.length > 0) {
                    this.selectedModelId.set(list[0].models[0].id);
                  }
                }
                this.isLoading.set(false);
              },
              error: () => {
                this.pageError.set('Impossible de charger les modèles.');
                this.isLoading.set(false);
              },
            });
        },
        error: () => {
          this.pageError.set('Impossible de charger les fournisseurs.');
          this.isLoading.set(false);
        },
      });
  }

  formatContextWindow(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M tokens`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}\u202fK tokens`;
    return `${tokens} tokens`;
  }
}

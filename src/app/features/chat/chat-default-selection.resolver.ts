import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';

import { ApiKeysApiService } from '../api-keys/api-keys-api.service';
import { GuestSessionService } from '../../core/auth/guest-session.service';
import { SessionService } from '../../core/auth/session.service';
import {
  ProviderModelRead,
  ProviderRead,
} from '../providers/provider.models';
import { ProvidersApiService } from '../providers/providers-api.service';
import {
  ChatStateService,
  ProviderModelSelection,
} from './chat-state.service';

export interface ChatDefaultSelectionResolution {
  provider: ProviderRead | null;
  models: ProviderModelRead[];
  model: ProviderModelRead | null;
}

interface ProviderChoice {
  provider: ProviderRead;
  selection: ProviderModelSelection | null;
}

@Injectable({ providedIn: 'root' })
export class ChatDefaultSelectionResolver {
  private readonly providersApi = inject(ProvidersApiService);
  private readonly apiKeysApi = inject(ApiKeysApiService);
  private readonly guestSession = inject(GuestSessionService);
  private readonly sessionService = inject(SessionService);
  private readonly chatState = inject(ChatStateService);

  resolve(
    providers: readonly ProviderRead[],
    conversationId: string,
  ): Observable<ChatDefaultSelectionResolution> {
    const activeProviders = providers.filter((provider) => provider.is_active);

    if (activeProviders.length === 0) {
      return of({
        provider: null,
        models: [],
        model: null,
      });
    }

    const preferredChoice = this.findPreferredChoice(
      activeProviders,
      conversationId,
    );

    const providerChoice$ =
      preferredChoice === null
        ? this.chooseProviderFromAvailableKeys(activeProviders)
        : of(preferredChoice);

    return providerChoice$.pipe(
      switchMap((choice) => {
        if (choice === null) {
          return of({
            provider: null,
            models: [],
            model: null,
          });
        }

        return forkJoin({
          models: this.providersApi.getProviderModels(choice.provider.id),
          defaultModel: this.providersApi.getDefaultModel(choice.provider.id),
        }).pipe(
          map(({ models, defaultModel }) => {
            const activeModels = models.filter(
              (model) =>
                model.is_active &&
                model.provider_id === choice.provider.id,
            );

            const restoredModel =
              choice.selection?.providerId === choice.provider.id
                ? activeModels.find(
                (model) => model.id === choice.selection?.modelId,
              ) ?? null
                : null;

            const backendDefaultIsAvailable =
              defaultModel !== null &&
              activeModels.some(
                (model) =>
                  model.id === defaultModel.id && model.is_default,
              );

            return {
              provider: choice.provider,
              models: activeModels,
              model: restoredModel ??
                (backendDefaultIsAvailable ? defaultModel : null),
            };
          }),
        );
      }),
    );
  }

  private findPreferredChoice(
    providers: readonly ProviderRead[],
    conversationId: string,
  ): ProviderChoice | null {
    const conversationSelection = this.chatState.getSelection(conversationId);
    const globalSelection = this.chatState.getSelection('global');

    const preferredProviderId =
      conversationSelection.providerId ?? globalSelection.providerId;

    if (preferredProviderId === null) {
      return null;
    }

    const provider = providers.find(
      (candidate) => candidate.id === preferredProviderId,
    );

    if (provider === undefined) {
      return null;
    }

    const selection =
      conversationSelection.providerId === provider.id
        ? {
          ...conversationSelection,
          modelId:
            conversationSelection.modelId ??
            (globalSelection.providerId === provider.id
              ? globalSelection.modelId
              : null),
        }
        : globalSelection;

    return { provider, selection };
  }

  private chooseProviderFromAvailableKeys(
    providers: readonly ProviderRead[],
  ): Observable<ProviderChoice | null> {
    return this.getProviderIdsWithActiveKeys().pipe(
      map((providerIdsWithKeys) => {
        const keyedProviders = providers.filter((provider) =>
          providerIdsWithKeys.has(provider.id),
        );

        if (keyedProviders.length === 0) {
          // Fallback produit existant : premier provider actif renvoyé par l'API.
          return {
            provider: providers[0],
            selection: null,
          };
        }

        // Le provider est tiré au sort seulement parmi ceux qui ont une clé.
        const randomIndex = Math.min(
          keyedProviders.length - 1,
          Math.floor(Math.random() * keyedProviders.length),
        );

        return {
          provider: keyedProviders[randomIndex],
          selection: null,
        };
      }),
    );
  }

  private getProviderIdsWithActiveKeys(): Observable<ReadonlySet<string>> {
    if (this.sessionService.isAuthenticated()) {
      return this.apiKeysApi.getAll().pipe(
        map(
          (apiKeys) =>
            new Set(
              apiKeys
                .filter((apiKey) => apiKey.isActive)
                .map((apiKey) => apiKey.providerId),
            ),
        ),
      );
    }

    const guestProviderIds = Object.entries(this.guestSession.apiKeys())
      .filter(([, apiKey]) => apiKey.trim().length > 0)
      .map(([providerId]) => providerId);

    return of(new Set(guestProviderIds));
  }
}

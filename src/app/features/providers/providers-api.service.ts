import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  catchError,
  defer,
  map,
  Observable,
  shareReplay,
  switchMap,
  of,
  throwError,
} from 'rxjs';

import {
  ProviderModelRead,
  ProviderRead,
} from './provider.models';

const PROVIDER_API_URL = '/api/v1/providers';

@Injectable({ providedIn: 'root' })
export class ProvidersApiService {
  private readonly http = inject(HttpClient);

  private readonly providersCache = new Map<
    string,
    Observable<ProviderRead[]>
  >();
  private readonly providerCache = new Map<string, Observable<ProviderRead>>();
  private readonly modelsCache = new Map<
    string,
    Observable<ProviderModelRead[]>
  >();

  getActiveProviders(): Observable<ProviderRead[]> {
    return this.getOrCreateCachedRequest(this.providersCache, 'all', () =>
      this.http.get<ProviderRead[]>(PROVIDER_API_URL, {
        withCredentials: true,
      }),
    );
  }

  /**
   * Alias conservé pour les consommateurs existants.
   */
  getProviders(): Observable<ProviderRead[]> {
    return this.getActiveProviders();
  }

  getProvider(providerId: string): Observable<ProviderRead> {
    const encodedProviderId = encodeURIComponent(providerId);

    return this.getOrCreateCachedRequest(
      this.providerCache,
      providerId,
      () =>
        this.http.get<ProviderRead>(
          `${PROVIDER_API_URL}/${encodedProviderId}`,
          { withCredentials: true },
        ),
    );
  }

  getProviderModels(providerId: string): Observable<ProviderModelRead[]> {
    const encodedProviderId = encodeURIComponent(providerId);

    return this.getOrCreateCachedRequest(
      this.modelsCache,
      providerId,
      () =>
        this.http.get<ProviderModelRead[]>(
          `${PROVIDER_API_URL}/${encodedProviderId}/models`,
          { withCredentials: true },
        ),
    );
  }

  /**
   * Retourne le modèle désigné par le backend comme modèle par défaut.
   * Retourne null si aucun modèle actif ne correspond ; aucun fallback
   * vers un autre modèle n'est effectué.
   */
  getDefaultModel(
    providerId: string,
  ): Observable<ProviderModelRead | null> {
    return this.getProvider(providerId).pipe(
      switchMap((provider) => {
        const defaultModelId = provider.default_model_id;

        if (defaultModelId === null) {
          return of(null);
        }

        return this.getProviderModels(providerId).pipe(
          map((models) => {
            const matchingDefaultModels = models.filter(
              (model) =>
                model.id === defaultModelId &&
                model.provider_id === providerId &&
                model.is_active &&
                model.is_default,
            );

            return matchingDefaultModels.length === 1
              ? matchingDefaultModels[0]
              : null;
          }),
        );
      }),
    );
  }

  /**
   * À appeler lorsque le contexte d'authentification est renouvelé.
   * Les requêtes déjà en cours peuvent finir pour leurs abonnés actuels ;
   * les prochains appels créeront de nouvelles requêtes.
   */
  invalidateCache(): void {
    this.providersCache.clear();
    this.providerCache.clear();
    this.modelsCache.clear();
  }

  private getOrCreateCachedRequest<T>(
    cache: Map<string, Observable<T>>,
    key: string,
    requestFactory: () => Observable<T>,
  ): Observable<T> {
    const cachedRequest = cache.get(key);
    if (cachedRequest) {
      return cachedRequest;
    }

    const entry: { observable: Observable<T> | null } = {
      observable: null,
    };

    const request$ = defer(requestFactory).pipe(
      catchError((error: unknown) => {
        // Une erreur ne reste pas en cache : l'appel suivant pourra réessayer.
        if (
          entry.observable !== null &&
          cache.get(key) === entry.observable
        ) {
          cache.delete(key);
        }

        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    entry.observable = request$;
    cache.set(key, request$);

    return request$;
  }
}

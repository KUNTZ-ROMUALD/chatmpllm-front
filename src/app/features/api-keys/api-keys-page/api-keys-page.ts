import { HttpErrorResponse } from '@angular/common/http';
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
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';


import { ChatStateService } from '../../chat/chat-state.service';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';



import { SessionService } from '../../../core/auth/session.service';
import { GuestSessionService } from '../../../core/auth/guest-session.service';
import { ProviderRead,ProviderModelRead} from '../../providers/provider.models';
import { ProvidersApiService } from '../../providers/providers-api.service';
import {
  ApiKey,
  ApiKeyStatus,
} from '../api-keys.models';
import { ApiKeysApiService } from '../api-keys-api.service';

const nonWhitespaceValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value: unknown = control.value;
  return typeof value === 'string' && value.trim().length > 0
    ? null
    : { whitespaceOnly: true };
};

@Component({
  selector: 'app-api-keys-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatIconModule,
    RouterLink,
    ReactiveFormsModule,
  ],
  templateUrl: './api-keys-page.html',
  styleUrl: './api-keys-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeysPage implements OnInit {
  private readonly apiKeysApi = inject(ApiKeysApiService);
  private readonly providersApi = inject(ProvidersApiService);
  private readonly sessionService = inject(SessionService);
  private readonly guestSession = inject(GuestSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatState = inject(ChatStateService);

  readonly isAuthenticated = computed(() => this.sessionService.isAuthenticated());
  readonly isGuestMode = computed(() => !this.isAuthenticated());

  readonly providers = signal<ProviderRead[]>([]);
  readonly keyStatuses = signal<ApiKeyStatus[]>([]);
  readonly selectedProviderId = signal<string | null>(null);

  readonly defaultModels = signal<
    ReadonlyMap<string, ProviderModelRead | null>
  >(new Map());
  readonly isDefaultModelsLoading = signal(false);
  readonly defaultModelsError = signal<string | null>(null);

  readonly isPageLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);
  readonly isEditorOpen = signal(false);
  readonly isDeleteConfirmationOpen = signal(false);

  readonly pageError = signal<string | null>(null);
  readonly operationError = signal<string | null>(null);
  readonly feedbackMessage = signal<string | null>(null);

  readonly isResolvingDefaultModel = signal(false);

  readonly selectedProvider = computed(() => {
    const providerId = this.selectedProviderId();
    return this.providers().find((provider) => provider.id === providerId) ?? null;
  });

  readonly selectedKeyStatus = computed(() => {
    const providerId = this.selectedProviderId();
    return (
      this.keyStatuses().find((key) => key.providerId === providerId) ?? null
    );
  });
  readonly providersWithActiveKeys = computed(() =>
    this.providers().filter((provider) =>
      this.keyStatuses().some(
        (key) => key.providerId === provider.id && key.isActive,
      ),
    ),
  );

  readonly retainedChatProvider = computed(() => {
    const providerId = this.chatState.getSelection('global').providerId;

    return (
      this.providers().find(
        (provider) => provider.id === providerId && provider.is_active,
      ) ?? null
    );
  });

  readonly providerPriorityMessage = computed(() => {
    const retainedProvider = this.retainedChatProvider();

    if (retainedProvider !== null) {
      return `Le provider retenu par le chat est ${retainedProvider.name}. Une sélection valide propre à une conversation reste prioritaire.`;
    }

    const keyedProviders = this.providersWithActiveKeys();

    if (keyedProviders.length === 1) {
      return `${keyedProviders[0].name} est le seul provider actif avec une clé configurée.`;
    }

    if (keyedProviders.length > 1) {
      return `Le chat choisira aléatoirement parmi les providers ayant une clé active : ${keyedProviders
        .map((provider) => provider.name)
        .join(', ')}.`;
    }

    const fallbackProvider = this.providers()[0];

    if (fallbackProvider !== undefined) {
      return `Aucune clé n’est configurée. Le fallback est le premier provider actif : ${fallbackProvider.name}. L’envoi peut être bloqué.`;
    }

    return 'Aucun provider actif n’est disponible.';
  });

  defaultModelFor(providerId: string): ProviderModelRead | null {
    return this.defaultModels().get(providerId) ?? null;
  }

  readonly keyForm = new FormGroup({
    apiKey: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, nonWhitespaceValidator],
    }),
    keyLabel: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
  });

  ngOnInit(): void {
    this.loadSettings();
  }

  onProviderSelectionChange(value: unknown): void {
    if (value === null) {
      this.selectedProviderId.set(null);
      this.isEditorOpen.set(false);
      this.isDeleteConfirmationOpen.set(false);
      this.resetForm();
      this.clearMessages();
      return;
    }

    if (
      typeof value !== 'string' ||
      !this.providers().some(
        (provider) => provider.id === value && provider.is_active,
      )
    ) {
      return;
    }

    this.selectedProviderId.set(value);
    this.isDeleteConfirmationOpen.set(false);
    this.clearMessages();

    if (this.isGuestMode()) {
      this.updateGuestKeyStatus();
    } else {
      const existingKey = this.keyStatuses().find(
        (key) => key.providerId === value,
      );
      this.isEditorOpen.set(existingKey === undefined);
      this.resetForm(existingKey?.keyLabel ?? '');
    }
  }

  startEditing(): void {
    const keyStatus = this.selectedKeyStatus();
    if (keyStatus === null) {
      return;
    }

    this.resetForm(keyStatus.keyLabel ?? '');
    this.isEditorOpen.set(true);
    this.isDeleteConfirmationOpen.set(false);
    this.clearMessages();
  }

  cancelEditing(): void {
    if (this.selectedKeyStatus() === null) {
      return;
    }

    this.isEditorOpen.set(false);
    this.resetForm(this.selectedKeyStatus()?.keyLabel ?? '');
    this.clearMessages();
  }

  saveKey(): void {
    const providerId = this.selectedProviderId();

    if (providerId === null || this.isSaving() || this.isDeleting()) {
      return;
    }

    if (this.keyForm.invalid) {
      this.keyForm.markAllAsTouched();
      return;
    }

    const apiKey = this.keyForm.controls.apiKey.value;
    const keyLabelControl = this.keyForm.controls.keyLabel;
    const normalizedLabel = keyLabelControl.value.trim();

    if (this.isGuestMode()) {
      this.isSaving.set(true);
      this.clearMessages();

      // La clé reste gérée par le GuestSessionService ; elle n'est pas copiée
      // dans l'état de sélection ni dans les logs.
      this.guestSession.setApiKey(providerId, apiKey);
      this.updateGuestKeyStatus();
      this.keyForm.controls.apiKey.reset('');

      this.providersApi
        .getDefaultModel(providerId)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.isSaving.set(false)),
        )
        .subscribe({
          next: (defaultModel) => {
            const selection = {
              providerId,
              modelId: defaultModel?.id ?? null,
            };

            // Le résolveur du Chat réutilisera cette préférence au retour sur /chat.
            this.chatState.setSelection('global', selection);

            this.feedbackMessage.set(
              defaultModel === null
                ? 'Clé API enregistrée. Aucun modèle par défaut actif n’est défini pour ce provider ; aucun autre modèle ne sera choisi automatiquement.'
                : `Clé API enregistrée. ${this.selectedProvider()?.name ?? 'Le provider'} et son modèle par défaut ${defaultModel.display_name} sont sélectionnés pour le Chat.`,
            );
          },
          error: () => {
            // Conserver le provider choisi. Au retour sur le Chat, son résolveur
            // pourra retenter la résolution du modèle par défaut.
            this.chatState.setSelection('global', {
              providerId,
              modelId: null,
            });

            this.feedbackMessage.set(
              'Clé API enregistrée. Le modèle par défaut n’a pas pu être vérifié ; réessayez depuis le Chat.',
            );
          },
        });

      return;
    }

    const existingKey = this.selectedKeyStatus() !== null;

    this.isSaving.set(true);
    this.clearMessages();

    const labelUpdate = keyLabelControl.dirty
      ? { keyLabel: normalizedLabel.length > 0 ? normalizedLabel : null }
      : {};

    const saveRequest$ = existingKey
      ? this.apiKeysApi.replace(providerId, {
        apiKey,
        ...labelUpdate,
      })
      : this.apiKeysApi.create({
        providerId,
        apiKey,
        ...(normalizedLabel.length > 0
          ? { keyLabel: normalizedLabel }
          : {}),
      });

    saveRequest$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.keyForm.controls.apiKey.reset('');
          this.isSaving.set(false);
        }),
      )
      .subscribe({
        next: (savedKey) => this.onKeySaved(savedKey),
        error: (error: unknown) => {
          this.operationError.set(
            getApiErrorMessage(error, 'Impossible d’enregistrer cette clé.'),
          );
        },
      });
  }

  requestDeleteConfirmation(): void {
    if (this.selectedKeyStatus() === null || this.isDeleting()) {
      return;
    }

    this.isDeleteConfirmationOpen.set(true);
    this.clearMessages();
  }

  keyStatusFor(providerId: string): ApiKeyStatus | null {
    return this.keyStatuses().find((key) => key.providerId === providerId) ?? null;
  }

  providerIcon(provider: ProviderRead): string {
    const code = provider.code.toLocaleLowerCase();
    if (code.includes('mistral')) return 'dataset';
    if (code.includes('google') || code.includes('gemini')) return 'auto_awesome';
    if (code.includes('groq')) return 'speed';
    if (code.includes('anthropic') || code.includes('claude')) return 'psychology';
    return 'hub';
  }

  openEditorForProvider(providerId: string): void {
    this.onProviderSelectionChange(providerId);
    this.isEditorOpen.set(true);
  }

  cancelDelete(): void {
    this.isDeleteConfirmationOpen.set(false);
  }

  deleteSelectedKey(): void {
    const providerId = this.selectedProviderId();

    if (
      providerId === null ||
      this.selectedKeyStatus() === null ||
      !this.isDeleteConfirmationOpen() ||
      this.isDeleting() ||
      this.isSaving()
    ) {
      return;
    }

    if (this.isGuestMode()) {
      this.isDeleting.set(true);
      this.clearMessages();
      this.guestSession.clearApiKey(providerId);
      this.updateGuestKeyStatus();
      this.isDeleting.set(false);
      this.isDeleteConfirmationOpen.set(false);
      this.resetForm();
      this.feedbackMessage.set('La clé API invité de ce fournisseur a été supprimée.');
      return;
    }

    this.isDeleting.set(true);
    this.clearMessages();

    this.apiKeysApi
      .delete(providerId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDeleting.set(false)),
      )
      .subscribe({
        next: () => {
          this.keyStatuses.update((keys) =>
            keys.filter((key) => key.providerId !== providerId),
          );
          this.isEditorOpen.set(false);
          this.isDeleteConfirmationOpen.set(false);
          this.resetForm();
          this.feedbackMessage.set('La clé API a été supprimée.');
        },
        error: (error: unknown) => {
          this.operationError.set(
            getApiErrorMessage(error, 'Impossible de supprimer cette clé.'),
          );
        },
      });
  }

  private loadSettings(): void {
    this.isPageLoading.set(true);
    this.pageError.set(null);

    if (this.isGuestMode()) {
      this.providersApi
        .getProviders()
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.isPageLoading.set(false)),
        )
        .subscribe({
          next: (providers) => {
            const activeProviders = providers.filter(
              (provider) => provider.is_active,
            );

            this.providers.set(activeProviders);
            this.updateGuestKeyStatus();
            this.selectInitialProvider(activeProviders);
            this.loadDefaultModels(activeProviders);
          },
          error: (error: unknown) => {
            this.pageError.set(
              getApiErrorMessage(error, 'Impossible de charger les fournisseurs.'),
            );
          },
        });

      return;
    }

    forkJoin({
      providers: this.providersApi.getProviders(),
      keys: this.apiKeysApi.getAll(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isPageLoading.set(false)),
      )
      .subscribe({
        next: ({ providers, keys }) => {
          const activeProviders = providers.filter(
            (provider) => provider.is_active,
          );

          this.providers.set(activeProviders);
          this.keyStatuses.set(keys);
          this.selectInitialProvider(activeProviders);
          this.loadDefaultModels(activeProviders);
        },
        error: (error: unknown) => {
          this.pageError.set(
            getApiErrorMessage(error, 'Impossible de charger les paramètres.'),
          );
        },
      });
  }

  private selectInitialProvider(providers: readonly ProviderRead[]): void {
    if (providers.length > 0 && this.selectedProviderId() === null) {
      this.onProviderSelectionChange(providers[0].id);
    }
  }

  private loadDefaultModels(providers: readonly ProviderRead[]): void {
    this.defaultModels.set(new Map());
    this.defaultModelsError.set(null);

    if (providers.length === 0) {
      this.isDefaultModelsLoading.set(false);
      return;
    }

    this.isDefaultModelsLoading.set(true);

    const requests = providers.map((provider) =>
      this.providersApi.getDefaultModel(provider.id).pipe(
        catchError(() => {
          this.defaultModelsError.set(
            'Impossible de vérifier le modèle par défaut de certains providers.',
          );
          return of(null);
        }),
      ),
    );

    forkJoin(requests)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDefaultModelsLoading.set(false)),
      )
      .subscribe((models) => {
        const defaultsByProvider = new Map<
          string,
          ProviderModelRead | null
        >();

        providers.forEach((provider, index) => {
          defaultsByProvider.set(provider.id, models[index] ?? null);
        });

        this.defaultModels.set(defaultsByProvider);
      });
  }

  private updateGuestKeyStatus(): void {
    if (!this.isGuestMode()) return;
    const guestKeys = this.guestSession.apiKeys();

    this.keyStatuses.set(
      this.providers()
        .filter((provider) => this.guestSession.hasApiKeyForProvider(provider.id))
        .map((provider) => ({
          providerId: provider.id,
          keyLabel: 'Clé locale du mode invité',
          keyLast4: guestKeys[provider.id]?.slice(-4) ?? null,
          isActive: true,
        })),
    );

    if (this.selectedKeyStatus()) {
      this.isEditorOpen.set(false);
    } else {
      this.isEditorOpen.set(true);
    }
  }

  private onKeySaved(savedKey: ApiKey): void {
    const status: ApiKeyStatus = {
      providerId: savedKey.providerId,
      keyLabel: savedKey.keyLabel,
      keyLast4: savedKey.keyLast4,
      isActive: savedKey.isActive,
    };

    this.keyStatuses.update((keys) => [
      ...keys.filter((key) => key.providerId !== status.providerId),
      status,
    ]);

    this.isEditorOpen.set(false);
    this.isDeleteConfirmationOpen.set(false);
    this.resetForm(status.keyLabel ?? '');

    // Le provider est choisi immédiatement ; le modèle sera résolu ensuite.
    // Seuls ces identifiants sont enregistrés, jamais la clé API.
    this.chatState.setSelection('global', {
      providerId: savedKey.providerId,
      modelId: null,
    });

    this.isResolvingDefaultModel.set(true);
    this.feedbackMessage.set(
      'Clé API enregistrée. Résolution du modèle par défaut…',
    );

    this.providersApi
      .getDefaultModel(savedKey.providerId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isResolvingDefaultModel.set(false)),
      )
      .subscribe({
        next: (defaultModel) => {
          this.chatState.setSelection('global', {
            providerId: savedKey.providerId,
            modelId: defaultModel?.id ?? null,
          });

          this.feedbackMessage.set(
            defaultModel === null
              ? 'Clé API enregistrée, mais aucun modèle par défaut actif n’est défini. Aucun autre modèle ne sera sélectionné automatiquement.'
              : `Clé API enregistrée. ${defaultModel.display_name} est le modèle par défaut sélectionné pour ce provider.`,
          );
        },
        error: () => {
          // Au retour dans le Chat, le résolveur pourra retenter l'appel.
          this.chatState.setSelection('global', {
            providerId: savedKey.providerId,
            modelId: null,
          });

          this.feedbackMessage.set(
            'Clé API enregistrée. Le modèle par défaut n’a pas pu être vérifié ; le Chat pourra réessayer.',
          );
        },
      });
  }

  private resetForm(keyLabel: string = ''): void {
    this.keyForm.reset({
      apiKey: '',
      keyLabel,
    });
  }

  private clearMessages(): void {
    this.operationError.set(null);
    this.feedbackMessage.set(null);
  }
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.error?.detail) {
      return String(error.error.detail);
    }
    if (error.status === 401) {
      return 'Votre session a expiré. Reconnectez-vous.';
    }
  }
  return fallback;
}

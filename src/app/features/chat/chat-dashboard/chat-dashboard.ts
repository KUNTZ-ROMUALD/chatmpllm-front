import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiKeysApiService } from '../../api-keys/api-keys-api.service';
import { ApiKeyStatus } from '../../api-keys/api-keys.models';
import { ChatDefaultSelectionResolver } from '../chat-default-selection.resolver';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  catchError,
  finalize,
  forkJoin,
  map,
  of,
  Subject,
  switchMap,
} from 'rxjs';

import { SessionService } from '../../../core/auth/session.service';
import { GuestSessionService } from '../../../core/auth/guest-session.service';
import { ConversationsApiService } from '../../conversations/conversations-api.service';
import {
  ConversationMessage,
  getMessageRoleLabel,
  isDisplayableRole,
} from '../../conversations/conversation.models';
import {ProviderModelRead, ProviderRead} from '../../providers/provider.models';
import { ProvidersApiService } from '../../providers/providers-api.service';
import { ChatConversationService } from '../chat-conversation.service';
import { ChatStateService, createTemporaryConversationId } from '../chat-state.service';
import { ChatStreamStateService } from '../chat-stream-state.service';
import {
  DEFAULT_NEAR_BOTTOM_THRESHOLD_PX,
  isNearBottom as isScrollContainerNearBottom,
  nextAutoScrollEnabled,
} from '../chat-scroll.utils';
import type { RichMessageRenderState } from '../rich-message.models';
import { RichMessage } from '../rich-message/rich-message';

interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  label: string;
  content: string;
  isUnsaved: boolean;
}
interface ProviderModelsResult {
  providerId: string | null;
  models: ProviderModelRead[];
  defaultModel: ProviderModelRead | null;
}

@Component({
  selector: 'app-chat-dashboard',
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    RichMessage,
  ],
  templateUrl: './chat-dashboard.html',
  styleUrl: './chat-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatDashboard implements OnInit {
  private readonly providersApi = inject(ProvidersApiService);
  private readonly conversationsApi = inject(ConversationsApiService);
  private readonly chatState = inject(ChatStateService);
  private readonly chatConversation = inject(ChatConversationService);
  readonly chatStream = inject(ChatStreamStateService);
  private readonly sessionService = inject(SessionService);
  private readonly guestSession = inject(GuestSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatDefaultSelectionResolver =
    inject(ChatDefaultSelectionResolver);
  private readonly apiKeysApi = inject(ApiKeysApiService);

  @ViewChild('messageTextarea') messageTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('chatStreamViewport')
  set chatStreamViewportRef(
    element: ElementRef<HTMLElement> | undefined,
  ) {
    this.chatStreamViewport = element;
    this.previousChatScrollTop = element?.nativeElement.scrollTop ?? 0;
  }
  private chatStreamViewport?: ElementRef<HTMLElement>;

  private readonly providerSelectionRequests = new Subject<string | null>();
  private readonly conversationSelectionRequests = new Subject<string | null>();

  readonly activeConversationId = signal(createTemporaryConversationId());
  readonly activeConversationTitle = signal<string | null>(null);

  readonly providers = signal<ProviderRead[]>([]);
  readonly models = signal<ProviderModelRead[]>([]);
  readonly messages = signal<ChatMessageView[]>([]);
  readonly pendingUserMessage = signal<string | null>(null);
  readonly showCurrentAssistant = signal(false);

  readonly isNearBottom = signal(true);
  readonly autoScrollEnabled = signal(true);



  readonly isComposerExpanded = signal(false);


  readonly isProvidersLoading = signal(false);
  readonly isModelsLoading = signal(false);
  readonly isConversationLoading = signal(false);

  readonly providersError = signal<string | null>(null);
  readonly modelsError = signal<string | null>(null);
  readonly conversationError = signal<string | null>(null);

  readonly messageDraft = signal('');
  readonly copiedMessageId = signal<string | null>(null);

  readonly systemMessageControl = new FormControl('', { nonNullable: true });

  readonly chatConversationId = this.chatConversation.conversationId;
  readonly apiKeyStatuses = signal<ApiKeyStatus[]>([]);
  readonly isApiKeyStatusLoading = signal(false);
  readonly apiKeyStatusError = signal<string | null>(null);

  readonly selectedProviderHasActiveApiKey = computed(() => {
    const providerId = this.selectedProviderId();

    if (providerId === null) {
      return false;
    }

    if (this.isGuestMode()) {
      return this.guestSession.hasApiKeyForProvider(providerId);
    }

    return this.apiKeyStatuses().some(
      (apiKey) => apiKey.providerId === providerId && apiKey.isActive,
    );
  });

  readonly isSelectedProviderMissingApiKey = computed(() => {
    const provider = this.selectedProvider();

    if (provider === null || !provider.supports_custom_api_key) {
      return false;
    }

    if (
      this.isAuthenticated() &&
      (this.isApiKeyStatusLoading() || this.apiKeyStatusError() !== null)
    ) {
      return false;
    }

    return !this.selectedProviderHasActiveApiKey();
  });

  readonly isAuthenticated = computed(() =>
    this.sessionService.isAuthenticated(),
  );
  readonly isGuestMode = computed(() => !this.isAuthenticated());

  readonly guestKeyIsAvailable = computed(() =>
    this.guestSession.hasApiKeyForProvider(this.selectedProviderId()),
  );

  readonly selectedProviderId = computed(
    () => this.chatState.getSelection(this.activeConversationId()).providerId,
  );
  readonly selectedModelId = computed(
    () => this.chatState.getSelection(this.activeConversationId()).modelId,
  );
  readonly hasSelectedModel = computed(
    () => this.selectedProviderId() !== null && this.selectedModelId() !== null,
  );

  readonly selectedProvider = computed(() => {
    const id = this.selectedProviderId();
    return this.providers().find((p) => p.id === id) ?? null;
  });

  readonly selectedModel = computed(() => {
    const id = this.selectedModelId();
    return this.models().find((m) => m.id === id) ?? null;
  });

  readonly selectedModelDisplayName = computed(() => {
    const model = this.selectedModel();
    if (model) {
      return model.display_name || model.model_name;
    }
    const provider = this.selectedProvider();
    if (provider) {
      return `${provider.name} (sélectionner modèle)`;
    }
    return 'Choisir un modèle';
  });

  readonly isBusy = computed(() => {
    const status = this.chatStream.status();
    return (
      status === 'loading' ||
      status === 'streaming' ||
      this.isConversationLoading()
    );
  });

  readonly currentAssistantRenderState = computed<RichMessageRenderState>(() => {
    switch (this.chatStream.status()) {
      case 'completed':
        return 'complete';

      case 'error':
        return 'interrupted';

      default:
        return 'streaming';
    }
  });

  readonly canSend = computed(() => {
    const text = this.messageDraft();
    const hasSelection =
      this.selectedProviderId() !== null && this.selectedModelId() !== null;

    const providerRequiresCustomApiKey =
      this.selectedProvider()?.supports_custom_api_key ?? true;

    const apiKeyRequirementIsMet =
      !providerRequiresCustomApiKey ||
      (this.isGuestMode()
        ? this.guestKeyIsAvailable()
        : !this.isApiKeyStatusLoading() &&
        this.apiKeyStatusError() === null &&
        this.selectedProviderHasActiveApiKey());

    return (
      !this.isBusy() &&
      hasSelection &&
      text.trim().length > 0 &&
      text.length <= 20_000 &&
      apiKeyRequirementIsMet
    );
  });
  readonly currentAssistantHasContent = computed(
    () => this.chatStream.assistantText().trim().length > 0,
  );

  readonly currentAssistantStatusLabel = computed(() => {
    switch (this.chatStream.status()) {
      case 'loading':
        return 'Connexion au fournisseur…';

      case 'streaming':
        return 'Génération en direct…';

      case 'completed':
        return 'Réponse générée';

      case 'error':
        return 'Réponse interrompue';

      default:
        return 'Réponse en attente…';
    }
  });

  private readonly commitUserMessageOnStreamStart = effect(() => {
    if (!this.chatStream.streamStarted()) {
      return;
    }

    const pendingMessage = this.pendingUserMessage();
    if (pendingMessage === null) {
      return;
    }

    this.messages.update((current) => [
      ...current,
      {
        id: createTemporaryConversationId(),
        role: 'user',
        label: 'Vous',
        content: pendingMessage,
        isUnsaved: false,
      },
    ]);

    this.pendingUserMessage.set(null);
    this.messageDraft.set('');
    this.resetCurrentComposerHeight();
    this.showCurrentAssistant.set(true);
  });
  private readonly autoScrollOnContentChange = effect((onCleanup) => {
    // Ces lectures rendent l'effet dépendant du contenu du fil et du stream SSE.
    this.messages();
    this.showCurrentAssistant();
    this.chatStream.assistantText();

    if (!this.autoScrollEnabled()) {
      return;
    }

    const viewport = this.chatStreamViewport?.nativeElement;
    if (viewport === undefined) {
      return;
    }

    const scrollToLatestContent = (): void => {
      // L'utilisateur a pu se détacher pendant que le callback attendait.
      if (!this.autoScrollEnabled()) {
        return;
      }

      viewport.scrollTop = viewport.scrollHeight;
      this.previousChatScrollTop = viewport.scrollTop;
      this.isNearBottom.set(true);
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      const frameId = globalThis.requestAnimationFrame(scrollToLatestContent);
      onCleanup(() => globalThis.cancelAnimationFrame(frameId));
      return;
    }

    const timeoutId = globalThis.setTimeout(scrollToLatestContent, 0);
    onCleanup(() => globalThis.clearTimeout(timeoutId));
  });
  private readonly nearBottomThresholdPx =
    DEFAULT_NEAR_BOTTOM_THRESHOLD_PX;
  private previousChatScrollTop = 0;

  ngOnInit(): void {
    this.listenForProviderChanges();
    this.listenForConversationSelection();
    this.listenToRouteParams();

    this.prepareChatRoute();

    this.loadProviders();

    if (this.isAuthenticated()) {
      this.loadApiKeyStatuses();
    }
    this.chatConversation.newDraftRequested$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.startNewConversation());
  }

  private listenToRouteParams(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const conversationId = params.get('conversationId');
        if (conversationId && conversationId !== this.activeConversationId()) {
          this.onConversationSelected(conversationId);
        }
      });
  }
  resumeAutoScroll(): void {
    const viewport = this.chatStreamViewport?.nativeElement;
    if (viewport === undefined) {
      return;
    }

    this.autoScrollEnabled.set(true);
    viewport.scrollTop = viewport.scrollHeight;
    this.previousChatScrollTop = viewport.scrollTop;
    this.isNearBottom.set(true);
  }

  onMessageInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      this.messageDraft.set(target.value);
      this.resizeComposer(target);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (this.canSend()) {
        this.sendMessage();
      }
    }
  }

  copyMessage(content: string, id: string): void {
    if (navigator?.clipboard) {
      void navigator.clipboard.writeText(content);
      this.copiedMessageId.set(id);
      setTimeout(() => {
        if (this.copiedMessageId() === id) {
          this.copiedMessageId.set(null);
        }
      }, 2000);
    }
  }

  navigateToProviders(): void {
    void this.router.navigate(['/providers']);
  }

  navigateToApiKeys(): void {
    void this.router.navigate(['/api-keys']);
  }

  onProviderChange(providerId: string | null): void {
    if (this.isBusy()) {
      return;
    }

    if (
      providerId !== null &&
      !this.providers().some(
        (provider) => provider.id === providerId && provider.is_active,
      )
    ) {
      return;
    }

    const currentConversationId = this.activeConversationId();
    const currentSelection = this.chatState.getSelection(currentConversationId);

    if (
      this.chatConversation.conversationId() !== null &&
      currentSelection.providerId !== providerId
    ) {
      this.startNewConversation();
    }

    const selection = { providerId, modelId: null };
    const targetConversationId = this.activeConversationId();

    this.chatState.setSelection(targetConversationId, selection);
    this.chatState.setSelection('global', selection);

    this.models.set([]);
    this.modelsError.set(null);
    this.providerSelectionRequests.next(providerId);
  }

  onChatViewportScroll(): void {
    const viewport = this.chatStreamViewport?.nativeElement;

    if (viewport === undefined) {
      return;
    }

    const currentScrollTop = viewport.scrollTop;
    const nearBottom = isScrollContainerNearBottom(
      viewport,
      this.nearBottomThresholdPx,
    );

    this.isNearBottom.set(nearBottom);
    this.autoScrollEnabled.set(
      nextAutoScrollEnabled(
        this.autoScrollEnabled(),
        this.previousChatScrollTop,
        currentScrollTop,
        nearBottom,
      ),
    );

    this.previousChatScrollTop = currentScrollTop;
  }

  private resetAutoScrollTracking(): void {
    this.autoScrollEnabled.set(true);
    this.isNearBottom.set(true);
    this.previousChatScrollTop =
      this.chatStreamViewport?.nativeElement.scrollTop ?? 0;
  }

  onModelChange(modelId: string | null): void {
    const providerId = this.selectedProviderId();

    const modelIsAvailable = this.models().some(
      (model) =>
        model.id === modelId &&
        model.provider_id === providerId &&
        model.is_active,
    );

    if (modelId !== null && !modelIsAvailable) {
      return;
    }

    const currentSelection = this.chatState.getSelection(
      this.activeConversationId(),
    );

    if (
      this.chatConversation.conversationId() !== null &&
      currentSelection.modelId !== modelId
    ) {
      this.startNewConversation();
    }

    const selection = { providerId, modelId };
    const targetConversationId = this.activeConversationId();

    this.chatState.setSelection(targetConversationId, selection);
    this.chatState.setSelection('global', selection);
  }

  onConversationSelected(conversationId: string): void {
    if (this.isBusy()) {
      return;
    }

    this.archiveCurrentAssistant();
    this.chatStream.resetForConversation();
    this.activeConversationId.set(conversationId);
    this.activeConversationTitle.set(null);
    this.messages.set([]);
    this.chatConversation.activateConversation(conversationId);
    this.chatState.setSelection(conversationId, {
      providerId: null,
      modelId: null,
    });
    this.conversationSelectionRequests.next(conversationId);
  }

  startNewConversation(): void {
    if (this.isBusy()) {
      return;
    }
    this.chatStream.resetForConversation();
    const previousSelection = this.chatState.getSelection(
      this.activeConversationId(),
    );

    this.chatConversation.resetToDraft();
    this.conversationSelectionRequests.next(null);

    const draftId = createTemporaryConversationId();
    this.activeConversationId.set(draftId);
    this.activeConversationTitle.set(null);
    this.chatState.setSelection(draftId, previousSelection);

    this.messages.set([]);
    this.pendingUserMessage.set(null);
    this.showCurrentAssistant.set(false);
    this.conversationError.set(null);
    this.messageDraft.set('');
    this.resetCurrentComposerHeight();

    void this.router.navigate(['/chat'], { queryParams: {} });
  }

  sendMessage(): void {
    if (!this.canSend()) {
      return;
    }


    this.autoScrollEnabled.set(true);
    this.archiveCurrentAssistant();

    this.archiveCurrentAssistant();

    const userMessage = this.messageDraft();
    const selection = this.chatState.getSelection(this.activeConversationId());
    const systemMessage = this.systemMessageControl.value.trim() || null;

    this.pendingUserMessage.set(userMessage);

    this.chatStream.send({
      selection: {
        providerId: selection.providerId,
        providerModelId: selection.modelId,
        systemMessage,
      },
      userMessage,
      ...(this.isGuestMode()
        ? {
          guest: {
            apiKey: this.guestSession.apiKeyForProvider(selection.providerId),
            systemMessage,
            history: this.getGuestHistory(),
          },
        }
        : {}),
    });
  }



  private prepareChatRoute(): void {
    // Un ID explicite signifie que l'utilisateur veut reprendre cette conversation.
    if (this.route.snapshot.queryParamMap.has('conversationId')) {
      return;
    }

    // Le lien Chat sans ID ouvre toujours un nouveau brouillon.
    this.chatStream.resetForConversation();
    this.chatConversation.resetToDraft();
    this.activeConversationId.set(createTemporaryConversationId());
    this.activeConversationTitle.set(null);
    this.messages.set([]);
    this.pendingUserMessage.set(null);
    this.showCurrentAssistant.set(false);
  }

  cancelGeneration(): void {
    this.chatStream.cancel();
  }

  retryProviders(): void {
    this.loadProviders();
  }

  retryModels(): void {
    const providerId = this.selectedProviderId();
    if (providerId !== null) {
      this.providerSelectionRequests.next(providerId);
    }
  }

  retryApiKeyStatus(): void {
    this.loadApiKeyStatuses();
  }

  private loadApiKeyStatuses(): void {
    if (!this.isAuthenticated()) {
      return;
    }

    this.isApiKeyStatusLoading.set(true);
    this.apiKeyStatusError.set(null);

    this.apiKeysApi
      .getAll()
      .pipe(
        catchError(() => {
          this.apiKeyStatusError.set('Impossible de vérifier les clés API.');
          return of<ApiKeyStatus[]>([]);
        }),
        finalize(() => this.isApiKeyStatusLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((apiKeys) => this.apiKeyStatuses.set(apiKeys));
  }

  private listenForProviderChanges(): void {
    this.providerSelectionRequests
      .pipe(
        switchMap((providerId) => {
          if (providerId === null) {
            return of<ProviderModelsResult>({
              providerId: null,
              models: [],
              defaultModel: null,
            });
          }

          this.isModelsLoading.set(true);
          this.modelsError.set(null);

          return forkJoin({
            models: this.providersApi.getProviderModels(providerId),
            defaultModel: this.providersApi.getDefaultModel(providerId),
          }).pipe(
            map(({ models, defaultModel }): ProviderModelsResult => {
              const activeModels = models.filter(
                (model) =>
                  model.is_active &&
                  model.provider_id === providerId,
              );

              const defaultModelIsAvailable =
                defaultModel !== null &&
                activeModels.some(
                  (model) =>
                    model.id === defaultModel.id &&
                    model.is_default,
                );

              return {
                providerId,
                models: activeModels,
                defaultModel: defaultModelIsAvailable ? defaultModel : null,
              };
            }),
            catchError(() => {
              this.modelsError.set('Impossible de charger les modèles.');
              return of<ProviderModelsResult>({
                providerId,
                models: [],
                defaultModel: null,
              });
            }),
            finalize(() => this.isModelsLoading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ providerId, models, defaultModel }) => {
        this.models.set(models);

        if (
          providerId === null ||
          this.selectedProviderId() !== providerId
        ) {
          return;
        }

        const conversationId = this.activeConversationId();
        const currentSelection = this.chatState.getSelection(conversationId);
        const currentModelIsAvailable = models.some(
          (model) => model.id === currentSelection.modelId,
        );

        const selection = currentModelIsAvailable
          ? currentSelection
          : {
            providerId,
            modelId: defaultModel?.id ?? null,
          };

        this.chatState.setSelection(conversationId, selection);
        this.chatState.setSelection('global', selection);
      });
  }

  private listenForConversationSelection(): void {
    this.conversationSelectionRequests
      .pipe(
        switchMap((conversationId) => {
          if (conversationId === null) {
            return of(null);
          }

          this.isConversationLoading.set(true);
          this.conversationError.set(null);

          return forkJoin({
            conversation: this.conversationsApi.getConversation(conversationId),
            messages: this.conversationsApi.getMessages(conversationId, {
              limit: 50,
              offset: 0,
            }),
          }).pipe(
            map(({ conversation, messages }) => ({
              conversation,
              messages: messages.items,
            })),
            catchError((error: unknown) => {
              this.conversationError.set(
                getConversationErrorMessage(error),
              );
              return of(null);
            }),
            finalize(() => this.isConversationLoading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result === null) {
          return;
        }

        const { conversation, messages } = result;
        const selection = {
          providerId: conversation.providerId,
          modelId: conversation.providerModelId,
        };
        this.chatState.setSelection(conversation.id, selection);
        this.chatState.setSelection('global', selection);
        this.providerSelectionRequests.next(conversation.providerId);
        this.activeConversationTitle.set(conversation.title);
        this.systemMessageControl.setValue(conversation.systemMessage ?? '');

        this.chatConversation.activateConversation(conversation.id);
        this.chatState.setSelection(conversation.id, {
          providerId: conversation.providerId,
          modelId: conversation.providerModelId,
        });
        this.providerSelectionRequests.next(conversation.providerId);

        this.messages.set(
          messages
            .filter(
              (
                message,
              ): message is ConversationMessage & {
                role: 'user' | 'assistant';
              } => isDisplayableRole(message.role),
            )
            .map((message) => ({
              id: message.id,
              role: message.role,
              label: getMessageRoleLabel(message.role),
              content: message.content,
              isUnsaved: false,
            }))
        );
      });
  }

  private loadProviders(): void {
    this.isProvidersLoading.set(true);
    this.providersError.set(null);

    this.providersApi
      .getActiveProviders()
      .pipe(
        map((providers) => providers.filter((provider) => provider.is_active)),
        catchError(() => {
          this.providersError.set('Impossible de charger les fournisseurs.');
          return of(null);
        }),
        finalize(() => this.isProvidersLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((providers) => {
        if (providers === null) {
          return;
        }

        this.providers.set(providers);

        // Une conversation chargée depuis le backend fournit déjà son choix.
        if (this.route.snapshot.queryParamMap.has('conversationId')) {
          return;
        }

        const conversationId = this.activeConversationId();
        this.isModelsLoading.set(true);

        this.chatDefaultSelectionResolver
          .resolve(providers, conversationId)
          .pipe(
            catchError(() => {
              this.providersError.set(
                'Impossible de résoudre le provider et son modèle par défaut.',
              );
              return of(null);
            }),
            finalize(() => this.isModelsLoading.set(false)),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe((resolution) => {
            // Ignore une résolution devenue obsolète après un changement de chat.
            if (
              resolution === null ||
              this.activeConversationId() !== conversationId
            ) {
              return;
            }

            this.models.set(resolution.models);

            const selection = {
              providerId: resolution.provider?.id ?? null,
              modelId: resolution.model?.id ?? null,
            };

            this.chatState.setSelection(conversationId, selection);
            this.chatState.setSelection('global', selection);
          });
      });
  }

  private getGuestHistory(): { role: 'user' | 'assistant'; content: string }[] {
    const eligibleMessages = this.messages()
      .filter((message) => !message.isUnsaved)
      .slice(-20);

    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    let totalCharacters = 0;

    for (const message of eligibleMessages) {
      if (
        message.content.trim().length === 0 ||
        message.content.length > 20_000 ||
        totalCharacters + message.content.length > 60_000
      ) {
        continue;
      }

      history.push({
        role: message.role,
        content: message.content,
      });
      totalCharacters += message.content.length;
    }

    return history;
  }

  private archiveCurrentAssistant(): void {
    if (!this.showCurrentAssistant()) {
      return;
    }

    const content = this.chatStream.assistantText();
    if (content.length > 0) {
      this.messages.update((current) => [
        ...current,
        {
          id: createTemporaryConversationId(),
          role: 'assistant',
          label: 'Assistant',
          content,
          isUnsaved: this.chatStream.assistantResponseNotSaved(),
        },
      ]);
    }

    this.showCurrentAssistant.set(false);
  }


  private resizeComposer(textarea: HTMLTextAreaElement): void {
    const maxHeight = 420;

    // Réinitialise temporairement la hauteur
    textarea.style.height = 'auto';

    // Calcule la hauteur réelle du texte
    const scrollHeight = textarea.scrollHeight;

    // Limite la hauteur maximale
    const nextHeight = Math.min(scrollHeight, maxHeight);

    textarea.style.height = `${nextHeight}px`;

    // Détecte le passage sur plusieurs lignes
    const lineHeight =
      parseFloat(getComputedStyle(textarea).lineHeight) || 24;

    const isMultiline = scrollHeight > lineHeight + 4;

    this.isComposerExpanded.set(isMultiline);

    // Active le scroll uniquement si nécessaire
    textarea.style.overflowY =
      scrollHeight > maxHeight ? 'auto' : 'hidden';
  }


  private resetCurrentComposerHeight(): void {
    this.isComposerExpanded.set(false);

    queueMicrotask(() => {
      const textarea = this.messageTextarea?.nativeElement;

      if (!textarea) {
        return;
      }

      textarea.style.height = '';
      textarea.style.overflowY = '';
    });
  }

}

function getConversationErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 404) {
    return 'Cette conversation n’est plus disponible.';
  }

  if (error instanceof HttpErrorResponse && error.status === 401) {
    return 'Votre session a expiré. Reconnectez-vous.';
  }

  return 'Impossible de charger cette conversation.';
}

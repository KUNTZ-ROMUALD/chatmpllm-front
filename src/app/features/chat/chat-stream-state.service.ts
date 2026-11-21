import { HttpErrorResponse } from '@angular/common/http';
import {
  DestroyRef,
  Injectable,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, catchError, map, of, switchMap, throwError } from 'rxjs';

import { SessionService } from '../../core/auth/session.service';
import {
  ChatConversationError,
  ChatConversationService,
  ConversationSelection,
} from './chat-conversation.service';
import { ChatSseService } from './chat-sse.service';
import {
  ChatStreamError,
  GuestHistoryItem,
  GuestStreamInput,
  StreamEvent,
  StreamInput,
  getStreamErrorMessage,
} from './chat-stream.models';
import { ChatStreamBufferService } from './chat-stream-buffer.service';

export type ChatStreamStatus =
  | 'idle'
  | 'loading'
  | 'streaming'
  | 'completed'
  | 'error';

export interface GuestChatSettings {
  apiKey: string;
  systemMessage?: string | null;
  history?: GuestHistoryItem[];
}

export interface ChatSendRequest {
  selection: ConversationSelection;
  userMessage: string;
  temperature?: number | null;
  maxOutputTokens?: number | null;
  guest?: GuestChatSettings;
}

@Injectable({ providedIn: 'root' })
export class ChatStreamStateService implements OnDestroy {
  private readonly sessionService = inject(SessionService);
  private readonly conversationService = inject(ChatConversationService);
  private readonly sseService = inject(ChatSseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly streamBuffer = inject(ChatStreamBufferService);

  private activeSubscription: Subscription | null = null;


  private streamHasStarted = false;
  private terminalEventReceived = false;
  private historyRefreshSentForCurrentStream = false;

  private readonly statusState = signal<ChatStreamStatus>('idle');

  private readonly errorState = signal<ChatStreamError | null>(null);
  private readonly assistantResponseNotSavedState = signal(false);
  private readonly streamStartedState = signal(false);
  readonly streamStarted = this.streamStartedState.asReadonly();

  readonly assistantText = this.streamBuffer.content;
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly assistantResponseNotSaved =
    this.assistantResponseNotSavedState.asReadonly();

  send(request: ChatSendRequest): void {
    if (
      this.activeSubscription !== null ||
      this.statusState() === 'loading' ||
      this.statusState() === 'streaming'
    ) {
      return;
    }

    this.streamBuffer.reset();
    this.errorState.set(null);
    this.assistantResponseNotSavedState.set(false);
    this.streamHasStarted = false;
    this.terminalEventReceived = false;
    this.historyRefreshSentForCurrentStream = false;
    this.statusState.set('loading');
    this.streamStartedState.set(false);

    const subscription = this.createStreamInput(request)
      .pipe(
        switchMap((input) => this.sseService.stream(input)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (event) => this.handleEvent(event),
        error: (error: unknown) => this.handleError(error),
        complete: () => {
          if (!this.terminalEventReceived) {
            this.handleError(
              new ChatStreamError(
                'interrupted',
                'La réponse a été interrompue.',
              ),
            );
          }

          this.activeSubscription = null;
        },
      });

    this.activeSubscription = subscription.closed ? null : subscription;
  }

  cancel(): void {
    if (this.activeSubscription === null) {
      return;
    }

    this.streamBuffer.flush();
    const subscription = this.activeSubscription;
    this.activeSubscription = null;
    subscription.unsubscribe();

    this.terminalEventReceived = true;
    this.statusState.set('error');
    this.errorState.set(
      new ChatStreamError('interrupted', 'La réponse a été interrompue.'),
    );
    this.assistantResponseNotSavedState.set(true);
  }

  ngOnDestroy(): void {
    this.streamBuffer.flush();
    this.activeSubscription?.unsubscribe();
    this.activeSubscription = null;
  }

  private createStreamInput(request: ChatSendRequest) {

    const validationError = validateRequest(request);
    if (validationError !== null) {
      return throwError(() => validationError);
    }
    const {providerId, providerModelId} = request.selection;

    const optionalParameters = {
      ...(request.temperature === undefined
        ? {}
        : {temperature: request.temperature}),
      ...(request.maxOutputTokens === undefined
        ? {}
        : {maxOutputTokens: request.maxOutputTokens}),
    };

    if (this.sessionService.isAuthenticated()) {
      if (!providerId || !providerModelId) {
        return throwError(
          () =>
            new ChatStreamError(
              'selection_missing',
              'Choisissez un fournisseur et un modèle avant de continuer.',
            ),
        );
      }

      return this.conversationService
        .ensureConversation(request.selection)
        .pipe(
          map(
            (conversationId): StreamInput => ({
              mode: 'conversation',
              conversationId,
              userMessage: request.userMessage,
              ...optionalParameters,
            }),
          ),
          catchError((error: unknown) =>
            throwError(() => mapConversationCreationError(error)),
          ),
        );
    }
    const guestInput = this.toGuestInput(request, optionalParameters);
    if (guestInput === null) {
      return throwError(
        () =>
          new ChatStreamError(
            'api_key_required',
            'Ajoutez votre clé API pour ce fournisseur.',
          ),
      );
    }

    return of<StreamInput>(guestInput);
  }

  private toGuestInput(
    request: ChatSendRequest,
    optionalParameters: {
      temperature?: number | null;
      maxOutputTokens?: number | null;
    },
  ): GuestStreamInput | null {
    const guest = request.guest;

    if (
      guest === undefined ||
      guest.apiKey.trim().length === 0 ||
      guest.apiKey.length > 512 ||
      request.selection.providerId === null ||
      request.selection.providerModelId === null
    ) {
      return null;
    }

    return {
      mode: 'guest',
      providerId: request.selection.providerId,
      providerModelId: request.selection.providerModelId,
      apiKey: guest.apiKey,
      userMessage: request.userMessage,
      systemMessage: guest.systemMessage ?? null,
      ...(guest.history === undefined ? {} : {history: guest.history}),
      ...optionalParameters,
    };
  }

  private handleEvent(event: StreamEvent): void {
    this.streamHasStarted = true;
    this.streamStartedState.set(true);

    switch (event.type) {
      case 'start':
        this.statusState.set('streaming');
        this.refreshHistoryAfterMessageStart();
        return;

      case 'meta':
        this.statusState.set('streaming');
        return;

      case 'token':
        this.statusState.set('streaming');
        this.streamBuffer.append(event.content);
        return;

      case 'end':
        this.streamBuffer.finalize();
        this.terminalEventReceived = true;
        this.statusState.set('completed');
        this.errorState.set(null);
        this.assistantResponseNotSavedState.set(false);
        return;
      case 'error':
        this.streamBuffer.finalize();
        this.terminalEventReceived = true;
        this.statusState.set('error');
        this.errorState.set(
          new ChatStreamError(
            'stream_error',
            getStreamErrorMessage(event.errorCode),
            null,
            event.errorCode,
          ),
        );
        this.assistantResponseNotSavedState.set(true);
        return;
      default:
        return assertNever(event);
    }
  }

  resetForConversation(): void {
    if (
      this.activeSubscription !== null ||
      this.statusState() === 'loading' ||
      this.statusState() === 'streaming'
    ) {
      return;
    }

    this.streamBuffer.reset();
    this.errorState.set(null);
    this.assistantResponseNotSavedState.set(false);
    this.streamStartedState.set(false);

    this.streamHasStarted = false;
    this.terminalEventReceived = false;
    this.historyRefreshSentForCurrentStream = false;
    this.statusState.set('idle');
  }

  private handleError(error: unknown): void {
    this.streamBuffer.flush();

    const chatError =
      error instanceof ChatStreamError
        ? error
        : error instanceof ChatConversationError
          ? new ChatStreamError(error.kind, error.message)
          : new ChatStreamError(
            'unknown',
            'Une erreur inattendue a empêché la réponse.',
          );

    this.terminalEventReceived = true;
    this.statusState.set('error');
    this.errorState.set(chatError);
    this.assistantResponseNotSavedState.set(
      this.streamHasStarted || this.assistantText().length > 0,
    );
    this.activeSubscription = null;
  }

  private refreshHistoryAfterMessageStart(): void {
    if (this.historyRefreshSentForCurrentStream) {
      return;
    }

    this.historyRefreshSentForCurrentStream = true;
    this.conversationService.notifyHistoryChanged();
  }

}



function validateRequest(request: ChatSendRequest): ChatStreamError | null {
  const message = request.userMessage;

  if (message.trim().length === 0 || message.length > 20_000) {
    return new ChatStreamError(
      'invalid_request',
      'Le message doit contenir entre 1 et 20 000 caractères.',
    );
  }

  if (
    request.temperature !== undefined &&
    request.temperature !== null &&
    (!Number.isFinite(request.temperature) ||
      request.temperature < 0 ||
      request.temperature > 2)
  ) {
    return new ChatStreamError(
      'invalid_request',
      'La température doit être comprise entre 0 et 2.',
    );
  }

  if (
    request.maxOutputTokens !== undefined &&
    request.maxOutputTokens !== null &&
    (!Number.isInteger(request.maxOutputTokens) ||
      request.maxOutputTokens < 1 ||
      request.maxOutputTokens > 8192)
  ) {
    return new ChatStreamError(
      'invalid_request',
      'Le nombre maximal de tokens doit être compris entre 1 et 8192.',
    );
  }

  if (!request.guest || request.guest.history === undefined) {
    return null;
  }

  const history = request.guest.history;
  const historyLength = history.reduce(
    (total, item) => total + item.content.length,
    0,
  );

  if (
    history.length > 20 ||
    historyLength > 60_000 ||
    history.some(
      (item) =>
        item.content.trim().length === 0 || item.content.length > 20_000,
    )
  ) {
    return new ChatStreamError(
      'invalid_request',
      'L’historique fourni n’est pas valide.',
    );
  }

  if (
    request.guest.systemMessage !== undefined &&
    request.guest.systemMessage !== null &&
    request.guest.systemMessage.length > 8000
  ) {
    return new ChatStreamError(
      'invalid_request',
      'Le message système ne peut pas dépasser 8 000 caractères.',
    );
  }

  return null;
}

function mapConversationCreationError(error: unknown): Error {
  if (error instanceof ChatConversationError) {
    return new ChatStreamError(error.kind, error.message);
  }

  if (error instanceof HttpErrorResponse && error.status === 401) {
    return new ChatStreamError(
      'session_expired',
      'Votre session a expiré. Reconnectez-vous pour continuer.',
    );
  }

  return new ChatStreamError(
    'unknown',
    'Impossible de préparer la conversation. Vous pouvez réessayer.',
  );
}

function assertNever(value: never): never {
  throw new Error(`Événement de streaming non pris en charge : ${String(value)}`);
}

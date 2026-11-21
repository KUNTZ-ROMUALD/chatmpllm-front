  import { HttpErrorResponse } from '@angular/common/http';
  import { computed, inject, Injectable, signal } from '@angular/core';

  import { catchError,
    finalize,
    map,
    shareReplay,
    tap,
    Observable,
    of,
    defer,
    throwError,
    Subject } from 'rxjs';

  import { SessionService } from '../../core/auth/session.service';
  import { ConversationsApiService } from '../conversations/conversations-api.service';
  import { Conversation } from '../conversations/conversation.models';

  export type ConversationStatus = 'draft' | 'creating' | 'ready' | 'error';

  export type ConversationErrorKind =
    | 'guest'
    | 'selection_missing'
    | 'selection_unavailable'
    | 'session_expired'
    | 'network'
    | 'unknown'
    | null;

  export interface ConversationSelection {
    providerId: string | null;
    providerModelId: string | null;
    systemMessage?: string | null;
  }

  export class ChatConversationError extends Error {
    constructor(
      readonly kind: Exclude<ConversationErrorKind, null>,
      message: string,
    ) {
      super(message);
      this.name = 'ChatConversationError';
    }
  }

  @Injectable({ providedIn: 'root' })
  export class ChatConversationService {
    private readonly sessionService = inject(SessionService);
    private readonly conversationsApi = inject(ConversationsApiService);

    private readonly conversationIdState = signal<string | null>(null);
    private readonly statusState = signal<ConversationStatus>('draft');
    private readonly errorKindState = signal<ConversationErrorKind>(null);
    private readonly errorMessageState = signal<string | null>(null);
    private readonly historyRefreshSubject = new Subject<void>();
    private readonly newDraftRequestedSubject = new Subject<void>();





    private creationRequest$: Observable<string> | null = null;

    readonly conversationId = this.conversationIdState.asReadonly();
    readonly status = this.statusState.asReadonly();
    readonly errorKind = this.errorKindState.asReadonly();
    readonly errorMessage = this.errorMessageState.asReadonly();


    /**
     * Le chat hôte écoute cet événement pour recharger l'historique après création.
     */
    readonly historyRefresh$ = this.historyRefreshSubject.asObservable();
    readonly newDraftRequested$ = this.newDraftRequestedSubject.asObservable();

    /**
     * Point d'entrée que le futur flux d'envoi devra appeler avant d'envoyer
     * un message. Cette méthode ne transmet ni ne journalise le contenu du message.
     */
    ensureConversation(selection: ConversationSelection): Observable<string> {
      if (!this.sessionService.isAuthenticated()) {
        return this.fail('guest', 'Connectez-vous pour enregistrer cette conversation.');
      }
      const providerId = selection.providerId;
      const providerModelId = selection.providerModelId;
      const systemMessage = selection.systemMessage ?? null;


      if (
        providerId === null ||
        providerId.trim().length === 0 ||
        providerModelId === null ||
        providerModelId.trim().length === 0
      ) {
        return this.fail(
          'selection_missing',
          'Choisissez un fournisseur et un modèle avant de continuer.',
        );
      }

      const existingConversationId = this.conversationIdState();
      if (existingConversationId !== null) {
        this.statusState.set('ready');
        this.clearError();
        return of(existingConversationId);
      }

      if (this.creationRequest$ !== null) {
        return this.creationRequest$;
      }

      this.statusState.set('creating');
      this.clearError();

      const requestReference: { request$: Observable<string> | null } = {
        request$: null,
      };

      const request$ = defer(() =>
        this.conversationsApi.createConversation({
          providerId,
          providerModelId,
          title: null,
          systemMessage,
        }),
      ).pipe(
        map((conversation: Conversation) => conversation.id),
        tap((conversationId) => {
          this.conversationIdState.set(conversationId);
          this.statusState.set('ready');
          this.clearError();
          this.notifyHistoryChanged();
        }),
        catchError((error: unknown) => {
          const failure = classifyCreationError(error);
          if (this.creationRequest$ === requestReference.request$) {
            this.statusState.set('error');
            this.errorKindState.set(failure.kind);
            this.errorMessageState.set(failure.message);
          }
          return throwError(() => new ChatConversationError(failure.kind, failure.message));
        }),
        finalize(() => {
          if (
            requestReference.request$ !== null &&
            this.creationRequest$ === requestReference.request$
          ) {
            this.creationRequest$ = null;
          }
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

      requestReference.request$ = request$;
      this.creationRequest$ = request$;

      return request$;
    }

    requestNewConversation(): void {
      this.newDraftRequestedSubject.next();
    }

    /**
     * Synchronise l'état quand l'utilisateur choisit une conversation existante
     * dans la sidebar. Aucun POST n'est effectué.
     */
    activateConversation(conversationId: string): void {
      this.creationRequest$ = null;
      this.conversationIdState.set(conversationId);
      this.statusState.set('ready');
      this.clearError();
    }

    /**
     * Démarre un brouillon frontend. Aucun identifiant temporaire n'est envoyé
     * au backend.
     */
    resetToDraft(): void {
      this.creationRequest$ = null;
      this.conversationIdState.set(null);
      this.statusState.set('draft');
      this.clearError();
    }

    /**
     * Signale qu'une opération a modifié l'historique des conversations.
     * L'événement peut venir d'une création, d'un message ou d'une suppression :
     * il ne dépend donc pas de la présence d'une conversation actuellement active.
     */
    notifyHistoryChanged(): void {
      if (this.sessionService.isAuthenticated()) {
        this.historyRefreshSubject.next();
      }
    }

    private fail(
      kind: Exclude<ConversationErrorKind, null>,
      message: string,
    ): Observable<never> {
      this.statusState.set('error');
      this.errorKindState.set(kind);
      this.errorMessageState.set(message);

      return throwError(() => new ChatConversationError(kind, message));
    }

    private clearError(): void {
      this.errorKindState.set(null);
      this.errorMessageState.set(null);
    }
  }

  function classifyCreationError(error: unknown): {
    kind: Exclude<ConversationErrorKind, null>;
    message: string;
  } {
    if (!(error instanceof HttpErrorResponse)) {
      return {
        kind: 'unknown',
        message: 'Une erreur inattendue a empêché la création de la conversation.',
      };
    }

    switch (error.status) {
      case 0:
        return {
          kind: 'network',
          message: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
        };
      case 401:
        return {
          kind: 'session_expired',
          message: 'Votre session a expiré. Reconnectez-vous pour continuer.',
        };
      case 404:
        return {
          kind: 'selection_unavailable',
          message: 'Ce fournisseur ou ce modèle n’est plus disponible. Rechoisissez-le.',
        };
      case 403:
        return {
          kind: 'unknown',
          message: 'La vérification de sécurité a échoué. Vous pouvez réessayer.',
        };
      case 422:
        return {
          kind: 'unknown',
          message: 'Les paramètres de la conversation ne sont pas valides.',
        };
      case 500:
        return {
          kind: 'unknown',
          message: 'Une erreur serveur a empêché la création. Vous pouvez réessayer.',
        };
      default:
        return {
          kind: 'unknown',
          message: 'Impossible de créer la conversation. Vous pouvez réessayer.',
        };
    }
  }

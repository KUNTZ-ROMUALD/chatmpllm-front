import { HttpXsrfTokenExtractor } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { SessionService } from '../../core/auth/session.service';
import {
  ChatStreamError,
  StreamEvent,
  StreamInput,
} from './chat-stream.models';
import { parseSseFrame, splitSseFrames } from './chat-sse.parser';

export const CHAT_FETCH = new InjectionToken<typeof fetch>('CHAT_FETCH', {
  providedIn: 'root',
  factory: () => globalThis.fetch.bind(globalThis),
});

const STREAM_URL = '/api/v1/stream';
const CSRF_REFRESH_URL = '/api/v1/auth/csrf';

// XSRF_HEADER_NAME n'est pas utilisé ici : le nom exact est fixé par le contrat.
// HttpXsrfTokenExtractor fournit le jeton depuis le cookie configuré dans Angular.
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';

@Injectable({ providedIn: 'root' })
export class ChatSseService {
  private readonly fetcher = inject(CHAT_FETCH);
  private readonly xsrfTokenExtractor = inject(HttpXsrfTokenExtractor);
  private readonly sessionService = inject(SessionService);

  /**
   * Empêche deux POST concurrents pour une même conversation.
   * Les streams invités partagent une clé, car ils ne possèdent pas
   * d'identifiant de conversation côté serveur.
   */
  private readonly activeStreamKeys = new Set<string>();

  stream(input: StreamInput): Observable<StreamEvent> {
    const body = JSON.stringify(toRequestBody(input));
    const streamKey =
      input.mode === 'conversation'
        ? `conversation:${input.conversationId}`
        : 'guest';

    return new Observable<StreamEvent>((subscriber) => {
      if (this.activeStreamKeys.has(streamKey)) {
        subscriber.error(
          new ChatStreamError(
            'generation_in_progress',
            'Une réponse est déjà en cours pour cette conversation.',
          ),
        );
        return;
      }

      this.activeStreamKeys.add(streamKey);

      let isLockReleased = false;
      const releaseLock = (): void => {
        if (isLockReleased) {
          return;
        }

        this.activeStreamKeys.delete(streamKey);
        isLockReleased = true;
      };

      const controller = new AbortController();
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let isFinished = false;

      const run = async (): Promise<void> => {
        const response = await this.postStream(body, controller.signal);

        if (!response.ok) {
          throw this.toHttpError(response);
        }

        if (
          !(response.headers.get('content-type') ?? '').includes(
            'text/event-stream',
          )
        ) {
          throw new ChatStreamError('invalid_stream', 'Réponse illisible.');
        }

        if (response.body === null) {
          throw new ChatStreamError(
            'interrupted',
            'La réponse a été interrompue.',
          );
        }

        reader = response.body.getReader();

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (!subscriber.closed) {
          const result = await reader.read();

          if (result.done) {
            buffer += decoder.decode();
            const finalFrames = splitSseFrames(buffer);

            for (const frame of finalFrames.frames) {
              if (
                await this.emitFrame(
                  frame,
                  subscriber,
                  reader,
                  () => {
                    isFinished = true;
                  },
                  releaseLock,
                )
              ) {
                return;
              }
            }

            throw new ChatStreamError(
              'interrupted',
              'La réponse a été interrompue.',
            );
          }

          buffer += decoder.decode(result.value, { stream: true });

          const extracted = splitSseFrames(buffer);
          buffer = extracted.remainder;

          for (const frame of extracted.frames) {
            if (
              await this.emitFrame(
                frame,
                subscriber,
                reader,
                () => {
                  isFinished = true;
                },
                releaseLock,
              )
            ) {
              return;
            }
          }
        }
      };

      void run()
        .then(() => {
          if (!subscriber.closed && !isFinished) {
            isFinished = true;
            releaseLock();
            subscriber.error(
              new ChatStreamError(
                'interrupted',
                'La réponse a été interrompue.',
              ),
            );
            return;
          }

          releaseLock();
        })
        .catch((error: unknown) => {
          isFinished = true;
          releaseLock();

          if (subscriber.closed) {
            return;
          }

          subscriber.error(
            error instanceof ChatStreamError
              ? error
              : new ChatStreamError(
                'network',
                'Connexion impossible. Vérifiez votre réseau puis réessayez.',
              ),
          );
        });

      return () => {
        if (isFinished) {
          releaseLock();
          return;
        }

        // Le verrou est libéré lorsque l'annulation fait terminer run()
        // et que son catch() s'exécute, pas avant.
        controller.abort();

        if (reader !== null) {
          void reader.cancel().catch(() => undefined);
        }
      };
    });
  }

  private async emitFrame(
    frame: string,
    subscriber: {
      closed: boolean;
      next: (event: StreamEvent) => void;
      complete: () => void;
    },
    reader: ReadableStreamDefaultReader<Uint8Array>,
    markFinished: () => void,
    releaseLock: () => void,
  ): Promise<boolean> {
    const event = parseSseFrame(frame);

    if (event === null || subscriber.closed) {
      return false;
    }

    subscriber.next(event);

    if (event.type === 'end' || event.type === 'error') {
      markFinished();
      releaseLock();

      await reader.cancel().catch(() => undefined);
      subscriber.complete();

      return true;
    }

    return false;
  }

  private async postStream(
    body: string,
    signal: AbortSignal,
  ): Promise<Response> {
    let token = this.xsrfTokenExtractor.getToken();

    if (token === null) {
      await this.refreshCsrf(signal);
      token = this.xsrfTokenExtractor.getToken();
    }

    if (token === null) {
      throw new ChatStreamError(
        'csrf',
        'La vérification de sécurité a échoué. Réessayez.',
      );
    }

    // Un seul POST est émis : ni 403 ni 409 ne déclenchent un nouvel envoi.
    return this.fetcher(STREAM_URL, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        [CSRF_HEADER_NAME]: token,
      },
      body,
    });
  }

  private async refreshCsrf(signal: AbortSignal): Promise<void> {
    const response = await this.fetcher(CSRF_REFRESH_URL, {
      method: 'GET',
      credentials: 'include',
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw this.toHttpError(response);
    }
  }

  private toHttpError(response: Response): ChatStreamError {
    if (response.status === 401) {
      this.sessionService.setAnonymousState();
      return new ChatStreamError(
        'session_expired',
        'Votre session a expiré. Reconnectez-vous pour continuer.',
      );
    }

    if (response.status === 400) {
      return new ChatStreamError(
        'api_key_required',
        'Ajoutez votre clé API pour ce fournisseur.',
      );
    }

    if (response.status === 403) {
      return new ChatStreamError(
        'csrf',
        'La vérification de sécurité a échoué. Réessayez.',
      );
    }

    if (response.status === 404) {
      return new ChatStreamError(
        'selection_unavailable',
        'Cette conversation ou ce modèle n’est plus disponible.',
      );
    }

    if (response.status === 406 || response.status === 422) {
      return new ChatStreamError(
        'invalid_request',
        'La requête n’est pas valide.',
      );
    }

    if (response.status === 409) {
      return new ChatStreamError(
        'generation_in_progress',
        'Une réponse est déjà en cours pour cette conversation.',
      );
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const seconds = Number.isFinite(retryAfter) ? retryAfter : null;
      const suffix =
        seconds === null ? '' : ` Réessayez dans ${seconds} secondes.`;

      return new ChatStreamError(
        'rate_limited',
        `Trop de requêtes.${suffix}`,
        seconds,
      );
    }

    if (response.status === 0) {
      return new ChatStreamError(
        'network',
        'Connexion impossible. Vérifiez votre réseau puis réessayez.',
      );
    }

    return new ChatStreamError(
      'server',
      'Le service de conversation est momentanément indisponible.',
    );
  }
}

function toRequestBody(input: StreamInput): Record<string, unknown> {
  if (input.mode === 'conversation') {
    const body: Record<string, unknown> = {
      conversation_id: input.conversationId,
      user_message: input.userMessage,
    };

    if (input.temperature !== undefined) {
      body['temperature'] = input.temperature;
    }

    if (input.maxOutputTokens !== undefined) {
      body['max_output_tokens'] = input.maxOutputTokens;
    }

    return body;
  }

  const body: Record<string, unknown> = {
    provider_id: input.providerId,
    provider_model_id: input.providerModelId,
    api_key: input.apiKey,
    user_message: input.userMessage,
  };

  if (input.systemMessage !== undefined) {
    body['system_message'] = input.systemMessage;
  }

  if (input.history !== undefined) {
    body['history'] = input.history.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  if (input.temperature !== undefined) {
    body['temperature'] = input.temperature;
  }

  if (input.maxOutputTokens !== undefined) {
    body['max_output_tokens'] = input.maxOutputTokens;
  }

  return body;
}

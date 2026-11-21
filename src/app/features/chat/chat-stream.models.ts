import { Observable } from 'rxjs';

export type StreamErrorCode =
  | 'provider_timeout'
  | 'provider_rate_limit'
  | 'provider_unavailable'
  | 'user_api_key_invalid'
  | 'model_unavailable'
  | 'context_too_long'
  | 'content_filtered'
  | 'internal_error';

export interface StreamUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface StartEvent {
  type: 'start';
  timestamp: string;
  conversationId: string | null;
}

export interface MetaEvent {
  type: 'meta';
  timestamp: string;
  provider: string;
  model: string;
}

export interface TokenEvent {
  type: 'token';
  timestamp: string;
  content: string;
  sequence: number;
}

export interface EndEvent {
  type: 'end';
  timestamp: string;
  messageId: string | null;
  usage: StreamUsage | null;
}

export interface StreamErrorEvent {
  type: 'error';
  timestamp: string;
  errorCode: StreamErrorCode;
  errorMessage: string;
}

export type StreamEvent =
  | StartEvent
  | MetaEvent
  | TokenEvent
  | EndEvent
  | StreamErrorEvent;

export interface ConversationStreamInput {
  mode: 'conversation';
  conversationId: string;
  userMessage: string;
  temperature?: number | null;
  maxOutputTokens?: number | null;
}

export interface GuestHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface GuestStreamInput {
  mode: 'guest';
  providerId: string;
  providerModelId: string;
  apiKey: string;
  userMessage: string;
  systemMessage?: string | null;
  history?: GuestHistoryItem[];
  temperature?: number | null;
  maxOutputTokens?: number | null;
}

export type StreamInput = ConversationStreamInput | GuestStreamInput;

export type ChatStreamErrorKind =
  | 'guest'
  | 'selection_missing'
  | 'selection_unavailable'
  | 'session_expired'
  | 'api_key_required'
  | 'csrf'
  | 'invalid_request'
  | 'generation_in_progress'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'interrupted'
  | 'invalid_stream'
  | 'stream_error'
  | 'unknown';

export class ChatStreamError extends Error {
  constructor(
    readonly kind: ChatStreamErrorKind,
    message: string,
    readonly retryAfterSeconds: number | null = null,
    readonly streamErrorCode: StreamErrorCode | null = null,
  ) {
    super(message);
    this.name = 'ChatStreamError';
  }
}

export function getStreamErrorMessage(code: StreamErrorCode): string {
  switch (code) {
    case 'provider_timeout':
      return 'Le fournisseur n’a pas répondu à temps. Réessayez.';
    case 'provider_rate_limit':
      return 'Trop de requêtes auprès du fournisseur. Réessayez dans un instant.';
    case 'provider_unavailable':
      return 'Le fournisseur est momentanément indisponible.';
    case 'user_api_key_invalid':
      return 'Votre clé API a été refusée par le fournisseur.';
    case 'model_unavailable':
      return 'Ce modèle n’est plus disponible. Choisissez-en un autre.';
    case 'context_too_long':
      return 'La conversation est trop longue pour ce modèle. Commencez-en une nouvelle.';
    case 'content_filtered':
      return 'Le fournisseur a refusé de répondre à ce message.';
    case 'internal_error':
      return 'Une erreur est survenue pendant la génération.';
    default:
      return assertNever(code);
  }
}

function assertNever(value: never): never {
  throw new Error(`Valeur non prise en charge : ${String(value)}`);
}

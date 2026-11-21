import {
  ChatStreamError,
  EndEvent,
  MetaEvent,
  StartEvent,
  StreamErrorCode,
  StreamErrorEvent,
  StreamEvent,
  TokenEvent,
} from './chat-stream.models';

export interface SseFrame {
  eventName: string;
  data: string;
}

export function splitSseFrames(buffer: string): {
  frames: string[];
  remainder: string;
} {
  const frames: string[] = [];
  const delimiter = /\r?\n\r?\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = delimiter.exec(buffer)) !== null) {
    frames.push(buffer.slice(cursor, match.index));
    cursor = delimiter.lastIndex;
  }

  return {
    frames,
    remainder: buffer.slice(cursor),
  };
}

export function parseSseFrame(frame: string): StreamEvent | null {
  let eventName = '';
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith(':')) {
      continue;
    }

    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? '' : line.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    if (field === 'event') {
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
    // Les champs id et retry sont volontairement ignorés.
  }

  if (dataLines.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join('\n'));
  } catch {
    throw invalidStreamError();
  }

  if (!isRecord(parsed) || typeof parsed['type'] !== 'string') {
    throw invalidStreamError();
  }

  const payloadType = parsed['type'];
  const eventTypeIsKnown = isKnownEventType(eventName);
  const payloadTypeIsKnown = isKnownEventType(payloadType);

  if (!eventTypeIsKnown && !payloadTypeIsKnown) {
    return null;
  }

  if (
    !eventTypeIsKnown ||
    !payloadTypeIsKnown ||
    eventName !== payloadType
  ) {
    throw invalidStreamError();
  }

  switch (payloadType) {
    case 'start':
      return parseStartEvent(parsed);
    case 'meta':
      return parseMetaEvent(parsed);
    case 'token':
      return parseTokenEvent(parsed);
    case 'end':
      return parseEndEvent(parsed);
    case 'error':
      return parseErrorEvent(parsed);
    default:
      return null;
  }
}

function parseStartEvent(value: Record<string, unknown>): StartEvent {
  if (
    typeof value['timestamp'] !== 'string' ||
    !isNullableString(value['conversation_id'])
  ) {
    throw invalidStreamError();
  }

  return {
    type: 'start',
    timestamp: value['timestamp'],
    conversationId: value['conversation_id'],
  };
}

function parseMetaEvent(value: Record<string, unknown>): MetaEvent {
  if (
    typeof value['timestamp'] !== 'string' ||
    typeof value['provider'] !== 'string' ||
    typeof value['model'] !== 'string'
  ) {
    throw invalidStreamError();
  }

  return {
    type: 'meta',
    timestamp: value['timestamp'],
    provider: value['provider'],
    model: value['model'],
  };
}

function parseTokenEvent(value: Record<string, unknown>): TokenEvent {
  if (
    typeof value['timestamp'] !== 'string' ||
    typeof value['content'] !== 'string' ||
    typeof value['sequence'] !== 'number' ||
    !Number.isInteger(value['sequence']) ||
    value['sequence'] < 1
  ) {
    throw invalidStreamError();
  }

  return {
    type: 'token',
    timestamp: value['timestamp'],
    content: value['content'],
    sequence: value['sequence'],
  };
}

function parseEndEvent(value: Record<string, unknown>): EndEvent {
  const rawUsage = value['usage'];

  if (
    typeof value['timestamp'] !== 'string' ||
    !isNullableString(value['message_id'])
  ) {
    throw invalidStreamError();
  }

  if (rawUsage !== null && !isValidUsage(rawUsage)) {
    throw invalidStreamError();
  }

  return {
    type: 'end',
    timestamp: value['timestamp'],
    messageId: value['message_id'],
    usage:
      rawUsage === null
        ? null
        : {
          inputTokens: rawUsage['input_tokens'],
          outputTokens: rawUsage['output_tokens'],
        },
  };
}

function parseErrorEvent(value: Record<string, unknown>): StreamErrorEvent {
  if (
    typeof value['timestamp'] !== 'string' ||
    typeof value['error_code'] !== 'string' ||
    !isStreamErrorCode(value['error_code']) ||
    typeof value['error_message'] !== 'string'
  ) {
    throw invalidStreamError();
  }

  return {
    type: 'error',
    timestamp: value['timestamp'],
    errorCode: value['error_code'],
    errorMessage: value['error_message'],
  };
}

function isValidUsage(
  value: unknown,
): value is {
  input_tokens: number | null;
  output_tokens: number | null;
} {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNullableInteger(value['input_tokens']) &&
    isNullableInteger(value['output_tokens'])
  );
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKnownEventType(
  value: string,
): value is StreamEvent['type'] {
  return (
    value === 'start' ||
    value === 'meta' ||
    value === 'token' ||
    value === 'end' ||
    value === 'error'
  );
}

function isStreamErrorCode(value: string): value is StreamErrorCode {
  return (
    value === 'provider_timeout' ||
    value === 'provider_rate_limit' ||
    value === 'provider_unavailable' ||
    value === 'user_api_key_invalid' ||
    value === 'model_unavailable' ||
    value === 'context_too_long' ||
    value === 'content_filtered' ||
    value === 'internal_error'
  );
}

function invalidStreamError(): ChatStreamError {
  return new ChatStreamError('invalid_stream', 'Réponse illisible.');
}

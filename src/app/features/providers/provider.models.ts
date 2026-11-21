export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface ProviderRead {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  supports_streaming: boolean;
  supports_system_message: boolean;
  supports_custom_api_key: boolean;
  default_model_id: string | null;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderModelRead {
  id: string;
  provider_id: string;
  model_name: string;
  display_name: string;
  is_active: boolean;
  is_default: boolean;
  context_window: number | null;
  supports_streaming: boolean | null;
  capabilities: JsonObject | null;
  created_at: string;
  updated_at: string;
}

/**
 * Alias temporaire pour les consommateurs qui utilisent encore l'ancien nom.
 * Les nouveaux usages doivent préférer ProviderModelRead.
 */
export type ProviderReadModel = ProviderModelRead;

import { Injectable, computed, signal } from '@angular/core';

const LEGACY_GUEST_API_KEY_STORAGE = 'nexus_guest_api_key';
const GUEST_API_KEYS_STORAGE = 'nexus_guest_api_keys_by_provider';

type GuestApiKeyStore = Record<string, string>;

@Injectable({ providedIn: 'root' })
export class GuestSessionService {
  private readonly apiKeysSignal = signal<GuestApiKeyStore>(
    this.loadStoredKeys(),
  );

  readonly apiKeys = this.apiKeysSignal.asReadonly();
  readonly hasAnyApiKey = computed(() =>
    Object.values(this.apiKeysSignal()).some((key) => key.trim().length > 0),
  );

  apiKeyForProvider(providerId: string | null): string {
    if (providerId === null) {
      return '';
    }
    return this.apiKeysSignal()[providerId] ?? '';
  }

  hasApiKeyForProvider(providerId: string | null): boolean {
    return this.apiKeyForProvider(providerId).trim().length > 0;
  }

  getKeyLast4(providerId: string | null): string | null {
    const key = this.apiKeyForProvider(providerId);
    return key ? key.slice(-4) : null;
  }

  setApiKey(providerId: string, key: string): void {
    const trimmed = key.trim();
    this.apiKeysSignal.update((current) => {
      const next = { ...current };
      if (trimmed) {
        next[providerId] = trimmed;
      } else {
        delete next[providerId];
      }
      return next;
    });
    this.persistKeys();
  }

  clearApiKey(providerId: string): void {
    this.setApiKey(providerId, '');
  }

  clearAllApiKeys(): void {
    this.apiKeysSignal.set({});
    this.persistKeys();
  }

  private loadStoredKeys(): GuestApiKeyStore {
    try {
      const stored = sessionStorage.getItem(GUEST_API_KEYS_STORAGE);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isGuestApiKeyStore(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignorer si sessionStorage inaccessible
    }

    return {};
  }

  private persistKeys(): void {
    try {
      const keys = this.apiKeysSignal();
      if (Object.keys(keys).length > 0) {
        sessionStorage.setItem(GUEST_API_KEYS_STORAGE, JSON.stringify(keys));
      } else {
        sessionStorage.removeItem(GUEST_API_KEYS_STORAGE);
      }
      sessionStorage.removeItem(LEGACY_GUEST_API_KEY_STORAGE);
    } catch {
      // Ignorer si sessionStorage inaccessible
    }
  }
}

function isGuestApiKeyStore(value: unknown): value is GuestApiKeyStore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === 'string');
}

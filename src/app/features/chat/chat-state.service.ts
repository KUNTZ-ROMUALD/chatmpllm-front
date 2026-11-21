import { Injectable, signal } from '@angular/core';

export interface ProviderModelSelection {
  providerId: string | null;
  modelId: string | null;
}

const EMPTY_SELECTION: ProviderModelSelection = {
  providerId: null,
  modelId: null,
};

const GLOBAL_SELECTION_STORAGE_KEY = 'nexus_chat_default_selection';

@Injectable({ providedIn: 'root' })
export class ChatStateService {
  private readonly selectionByConversation = signal<
    ReadonlyMap<string, ProviderModelSelection>
  >(this.loadInitialSelections());

  getSelection(conversationId: string): ProviderModelSelection {
    return this.selectionByConversation().get(conversationId) ?? EMPTY_SELECTION;
  }

  setSelection(
    conversationId: string,
    selection: ProviderModelSelection,
  ): void {
    const selectionCopy = { ...selection };

    this.selectionByConversation.update((currentSelections) => {
      const nextSelections = new Map(currentSelections);
      nextSelections.set(conversationId, selectionCopy);
      return nextSelections;
    });

    if (conversationId === 'global') {
      this.persistGlobalSelection(selectionCopy);
    }
  }

  private loadInitialSelections(): ReadonlyMap<
    string,
    ProviderModelSelection
  > {
    const selections = new Map<string, ProviderModelSelection>();
    const storedSelection = this.readStoredGlobalSelection();

    if (storedSelection !== null) {
      selections.set('global', storedSelection);
    }

    return selections;
  }

  private readStoredGlobalSelection(): ProviderModelSelection | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }

    try {
      const storedValue = sessionStorage.getItem(
        GLOBAL_SELECTION_STORAGE_KEY,
      );

      if (storedValue === null) {
        return null;
      }

      const parsedValue: unknown = JSON.parse(storedValue);
      return isProviderModelSelection(parsedValue) ? parsedValue : null;
    } catch {
      return null;
    }
  }

  private persistGlobalSelection(selection: ProviderModelSelection): void {
    if (typeof sessionStorage === 'undefined') {
      return;
    }

    try {
      if (selection.providerId === null) {
        sessionStorage.removeItem(GLOBAL_SELECTION_STORAGE_KEY);
        return;
      }

      sessionStorage.setItem(
        GLOBAL_SELECTION_STORAGE_KEY,
        JSON.stringify(selection),
      );
    } catch {
      // Le chat reste utilisable si le navigateur bloque sessionStorage.
    }
  }
}

function isProviderModelSelection(
  value: unknown,
): value is ProviderModelSelection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('providerId' in value) || !('modelId' in value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    (record['providerId'] === null ||
      typeof record['providerId'] === 'string') &&
    (record['modelId'] === null || typeof record['modelId'] === 'string')
  );
}

/**
 * L'identifiant temporaire sert uniquement de clé d'état frontend.
 * Il ne contient aucune donnée d'authentification.
 */
export function createTemporaryConversationId(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

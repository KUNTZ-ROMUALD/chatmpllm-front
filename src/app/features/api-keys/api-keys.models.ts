export interface ApiKeyStatus {
  providerId: string;
  keyLabel: string | null;
  keyLast4: string | null;
  isActive: boolean;
}

export interface ApiKey extends ApiKeyStatus {
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyInput {
  providerId: string;
  apiKey: string;
  /**
   * Omettre pour laisser le backend appliquer sa valeur par défaut.
   * Envoyer null explicitement pour demander un label vide.
   */
  keyLabel?: string | null;
}

export interface ReplaceApiKeyInput {
  apiKey: string;
  /**
   * Omettre pour conserver le label existant ; null l'efface.
   */
  keyLabel?: string | null;
}

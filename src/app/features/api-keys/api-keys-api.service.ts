import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import {
  ApiKey,
  ApiKeyStatus,
  CreateApiKeyInput,
  ReplaceApiKeyInput,
} from './api-keys.models';

const API_KEYS_URL = '/api/v1/api-keys';

interface ApiKeyStatusResponse {
  provider_id: string;
  key_label: string | null;
  key_last4: string | null;
  is_active: boolean;
}

interface ApiKeyResponse extends ApiKeyStatusResponse {
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateApiKeyRequest {
  provider_id: string;
  api_key: string;
  key_label?: string | null;
}

interface ReplaceApiKeyRequest {
  api_key: string;
  key_label?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiKeysApiService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<ApiKeyStatus[]> {
    return this.http
      .get<ApiKeyStatusResponse[]>(API_KEYS_URL, { withCredentials: true })
      .pipe(map((responses) => responses.map(mapApiKeyStatus)));
  }

  create(input: CreateApiKeyInput): Observable<ApiKey> {
    const body: CreateApiKeyRequest = {
      provider_id: input.providerId,
      api_key: input.apiKey,
      ...(input.keyLabel === undefined ? {} : { key_label: input.keyLabel }),
    };

    return this.http
      .post<ApiKeyResponse>(API_KEYS_URL, body, { withCredentials: true })
      .pipe(map(mapApiKey));
  }

  replace(
    providerId: string,
    input: ReplaceApiKeyInput,
  ): Observable<ApiKey> {
    const encodedProviderId = encodeURIComponent(providerId);
    const body: ReplaceApiKeyRequest = {
      api_key: input.apiKey,
      ...(input.keyLabel === undefined ? {} : { key_label: input.keyLabel }),
    };

    return this.http
      .patch<ApiKeyResponse>(
        `${API_KEYS_URL}/${encodedProviderId}`,
        body,
        { withCredentials: true },
      )
      .pipe(map(mapApiKey));
  }

  delete(providerId: string): Observable<void> {
    const encodedProviderId = encodeURIComponent(providerId);

    return this.http.delete<void>(
      `${API_KEYS_URL}/${encodedProviderId}`,
      { withCredentials: true },
    );
  }
}

function mapApiKeyStatus(response: ApiKeyStatusResponse): ApiKeyStatus {
  return {
    providerId: response.provider_id,
    keyLabel: response.key_label,
    keyLast4: response.key_last4,
    isActive: response.is_active,
  };
}

function mapApiKey(response: ApiKeyResponse): ApiKey {
  return {
    ...mapApiKeyStatus(response),
    lastUsedAt: response.last_used_at,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

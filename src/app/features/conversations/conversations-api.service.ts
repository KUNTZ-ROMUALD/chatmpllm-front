import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import {
  Conversation,
  ConversationListItem,
  ConversationMessage,
  CreateConversationInput,
  Page,
  PageParams,
  UpdateConversationInput,
} from '../conversation.models';

const CONVERSATIONS_API_URL = '/api/v1/conversations';

interface ApiPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface ApiConversationListItem {
  id: string;
  title: string | null;
  provider_id: string;
  provider_model_id: string;
  last_message_at: string | null;
}

interface ApiConversation extends ApiConversationListItem {
  system_message: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface ApiConversationMessage {
  id: string;
  conversation_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  sequence: number;
  token_count: number | null;
  created_at: string;
  updated_at: string;
}

interface CreateConversationRequest {
  provider_id: string;
  provider_model_id: string;
  title?: string | null;
  system_message?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ConversationsApiService {
  private readonly http = inject(HttpClient);

  getConversations(
    params: PageParams = {},
  ): Observable<Page<ConversationListItem>> {
    const queryParams = this.toPageParams(params, 20);

    return this.http
      .get<ApiPage<ApiConversationListItem>>(CONVERSATIONS_API_URL, {
        params: queryParams,
        withCredentials: true,
      })
      .pipe(map((page) => mapPage(page, mapConversationListItem)));
  }

  createConversation(
    input: CreateConversationInput,
  ): Observable<Conversation> {
    const body: CreateConversationRequest = {
      provider_id: input.providerId,
      provider_model_id: input.providerModelId,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.systemMessage === undefined
        ? {}
        : { system_message: input.systemMessage }),
    };

    return this.http
      .post<ApiConversation>(CONVERSATIONS_API_URL, body, {
        withCredentials: true,
      })
      .pipe(map(mapConversation));
  }

  getConversation(conversationId: string): Observable<Conversation> {
    const encodedConversationId = encodeURIComponent(conversationId);

    return this.http
      .get<ApiConversation>(
        `${CONVERSATIONS_API_URL}/${encodedConversationId}`,
        { withCredentials: true },
      )
      .pipe(map(mapConversation));
  }

  updateConversation(
    conversationId: string,
    input: UpdateConversationInput,
  ): Observable<Conversation> {
    const encodedConversationId = encodeURIComponent(conversationId);
    const body = this.toUpdateBody(input);

    return this.http
      .patch<ApiConversation>(
        `${CONVERSATIONS_API_URL}/${encodedConversationId}`,
        body,
        { withCredentials: true },
      )
      .pipe(map(mapConversation));
  }

  deleteConversation(conversationId: string): Observable<void> {
    const encodedConversationId = encodeURIComponent(conversationId);

    return this.http.delete<void>(
      `${CONVERSATIONS_API_URL}/${encodedConversationId}`,
      { withCredentials: true },
    );
  }

  getMessages(
    conversationId: string,
    params: PageParams = {},
  ): Observable<Page<ConversationMessage>> {
    const encodedConversationId = encodeURIComponent(conversationId);
    const queryParams = this.toPageParams(params, 50);

    return this.http
      .get<ApiPage<ApiConversationMessage>>(
        `${CONVERSATIONS_API_URL}/${encodedConversationId}/messages`,
        {
          params: queryParams,
          withCredentials: true,
        },
      )
      .pipe(map((page) => mapPage(page, mapConversationMessage)));
  }

  private toPageParams(params: PageParams, defaultLimit: number): HttpParams {
    return new HttpParams()
      .set('limit', params.limit ?? defaultLimit)
      .set('offset', params.offset ?? 0);
  }

  private toUpdateBody(
    input: UpdateConversationInput,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    if (input.title !== undefined) {
      body['title'] = input.title;
    }
    if (input.systemMessage !== undefined) {
      body['system_message'] = input.systemMessage;
    }
    if (input.isArchived !== undefined) {
      body['is_archived'] = input.isArchived;
    }

    return body;
  }
}

function mapPage<TApi, TModel>(
  page: ApiPage<TApi>,
  mapper: (item: TApi) => TModel,
): Page<TModel> {
  return {
    items: page.items.map(mapper),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  };
}

function mapConversationListItem(
  response: ApiConversationListItem,
): ConversationListItem {
  return {
    id: response.id,
    title: response.title,
    providerId: response.provider_id,
    providerModelId: response.provider_model_id,
    lastMessageAt: response.last_message_at,
  };
}

function mapConversation(response: ApiConversation): Conversation {
  return {
    ...mapConversationListItem(response),
    systemMessage: response.system_message,
    isArchived: response.is_archived,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

function mapConversationMessage(
  response: ApiConversationMessage,
): ConversationMessage {
  return {
    id: response.id,
    conversationId: response.conversation_id,
    role: response.role,
    content: response.content,
    sequence: response.sequence,
    tokenCount: response.token_count,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
  };
}

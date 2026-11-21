export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageParams {
  limit?: number;
  offset?: number;
}

export interface ConversationListItem {
  id: string;
  title: string | null;
  providerId: string;
  providerModelId: string;
  lastMessageAt: string | null;
}

export interface Conversation {
  id: string;
  title: string | null;
  providerId: string;
  providerModelId: string;
  systemMessage: string | null;
  isArchived: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  sequence: number;
  tokenCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationInput {
  providerId: string;
  providerModelId: string;
  title?: string | null;
  systemMessage?: string | null;
}

export interface UpdateConversationInput {
  title?: string | null;
  systemMessage?: string | null;
  isArchived?: boolean;
}



/**
 * system message and tool is not display inside the fil user
 * this function is unique source the decide which roles to display
 */
export function isDisplayableRole(
  role: MessageRole,
): role is 'user' | 'assistant' {
  switch (role) {
    case 'user':
    case 'assistant':
      return true;
    case 'system':
    case 'tool':
      return false;
    default:
      return assertNever(role);
  }
}

/** Provides a comprehensive description for any displayable or technical role. */
export function getMessageRoleLabel(role: MessageRole): string {
  switch (role) {
    case 'system':
      return 'Système';
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'tool':
      return 'Tool';
    default:
      return assertNever(role);
  }
}

export function getNextPageParams<T>(page: Page<T>): PageParams | null {
  const nextOffset = page.offset + page.limit;

  return nextOffset < page.total
    ? { limit: page.limit, offset: nextOffset }
    : null;
}

export function hasNextPage<T>(page: Page<T>): boolean {
  return getNextPageParams(page) !== null;
}

function assertNever(value: never): never {
  throw new Error(`Rôle de message non pris en charge : ${String(value)}`);
}

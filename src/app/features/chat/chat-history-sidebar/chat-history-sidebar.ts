import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  catchError,
  finalize,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';

import { ChatConversationService } from '../chat-conversation.service';
import { ConversationsApiService } from '../../conversations/conversations-api.service';
import { ConversationListItem } from '../../conversations/conversation.models';
import {MatIconModule} from '@angular/material/icon';

const RECENT_CONVERSATIONS_LIMIT = 10;

@Component({
  selector: 'app-chat-history-sidebar',
  standalone: true,
  imports: [ RouterLink,MatIconModule],
  templateUrl: './chat-history-sidebar.html',
  styleUrl: './chat-history-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHistorySidebar implements OnInit {
  private readonly conversationsApi = inject(ConversationsApiService);
  private readonly chatConversation = inject(ChatConversationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refreshRequests = new Subject<void>();

  @Input() activeConversationId: string | null = null;
  @Input() disabled = false;

  @Output() readonly conversationSelected = new EventEmitter<string>();
  @Output() readonly newConversationRequested = new EventEmitter<void>();

  readonly conversations = signal<ConversationListItem[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    this.refreshRequests
      .pipe(
        startWith(undefined),
        switchMap(() => {
          this.isLoading.set(true);
          this.loadError.set(null);

          return this.conversationsApi
            .getConversations({
              limit: RECENT_CONVERSATIONS_LIMIT,
              offset: 0,
            })
            .pipe(
              catchError(() => {
                this.loadError.set(
                  'Impossible de charger les conversations récentes.',
                );
                return of(null);
              }),
              finalize(() => this.isLoading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((page) => {
        if (page !== null) {
          // L'ordre de récence est fourni par l'API ; ne pas retrier côté client.
          this.conversations.set(page.items);
        }
      });

    this.chatConversation.historyRefresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshRequests.next());
  }

  requestNewConversation(): void {
    if (!this.disabled) {
      this.newConversationRequested.emit();
    }
  }

  selectConversation(conversationId: string): void {
    if (!this.disabled) {
      this.conversationSelected.emit(conversationId);
    }
  }

  retry(): void {
    this.refreshRequests.next();
  }
}

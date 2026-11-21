import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';
import { ChatConversationService } from '../../chat/chat-conversation.service';

import { ConversationsApiService } from '../conversations-api.service';
import {
  Conversation,
  ConversationListItem,
} from '../conversation.models';

const CONVERSATIONS_PAGE_SIZE = 10;
type ConversationDateFilter = 'all' | 'today' | 'week';
type ConversationProviderFilter = 'all' | 'openai' | 'anthropic' | 'google' | 'mistral';

@Component({
  selector: 'app-conversation-sidebar',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './conversation-sidebar.html',
  styleUrl: './conversation-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationSidebar implements OnInit {
  private readonly conversationsApi = inject(ConversationsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chatConversation = inject(ChatConversationService);
  private readonly localSelection = signal<string | null>(null);
  private readonly parentSelection = signal<string | null>(null);

  @Output() readonly conversationSelected = new EventEmitter<string>();
  @Output() readonly conversationDeleted = new EventEmitter<string>();
  @Input() disabled = false;

  @Input()
  set activeConversationId(value: string | null) {
    this.parentSelection.set(value);
    this.localSelection.set(null);
  }

  readonly activeId = computed(
    () => this.parentSelection() ?? this.localSelection(),
  );

  readonly conversations = signal<ConversationListItem[]>([]);
  readonly searchTerm = signal('');
  readonly dateFilter = signal<ConversationDateFilter>('all');
  readonly providerFilter = signal<ConversationProviderFilter>('all');
  readonly total = signal(0);
  readonly nextOffset = signal(0);
  readonly hasLoaded = signal(false);
  readonly isInitialLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly renameConversationId = signal<string | null>(null);
  readonly pendingDeleteConversationId = signal<string | null>(null);
  readonly isRenaming = signal(false);
  readonly isDeleting = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly actionFeedback = signal<string | null>(null);

  readonly renameTitle = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(200),
    ],
  });

  readonly hasNextPage = computed(() => this.nextOffset() < this.total());

  readonly filteredConversations = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();

    return this.conversations()
      .filter((conversation) => {
        const matchesSearch =
          query.length === 0 ||
          (conversation.title ?? 'Nouvelle conversation')
            .toLocaleLowerCase()
            .includes(query);

        return matchesSearch && this.matchesDateFilter(conversation);
      })
      .filter((conversation) => this.matchesProviderFilter(conversation));
    });

  readonly visibleConversations = this.filteredConversations;

  readonly loadedCount = computed(() => this.conversations().length);
  readonly filteredCount = computed(() => this.filteredConversations().length);

  ngOnInit(): void {
    this.loadFirstPage();

    this.chatConversation.historyRefresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshHistoryAfterCreation());
  }

  onSearchInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.searchTerm.set(target.value);
    }
  }

  setDateFilter(filter: ConversationDateFilter): void {
    this.dateFilter.set(filter);
  }

  setProviderFilter(filter: ConversationProviderFilter): void {
    this.providerFilter.set(filter);
  }

  selectConversation(conversationId: string): void {
    this.localSelection.set(conversationId);
    this.conversationSelected.emit(conversationId);
  }

  startRename(conversation: ConversationListItem): void {
    if (this.isRenaming() || this.isDeleting()) {
      return;
    }

    this.actionError.set(null);
    this.actionFeedback.set(null);
    this.renameTitle.reset(conversation.title ?? '');
    this.renameConversationId.set(conversation.id);
  }

  cancelRename(): void {
    if (this.isRenaming()) {
      return;
    }

    this.renameConversationId.set(null);
    this.renameTitle.reset('');
    this.actionError.set(null);
  }

  saveRename(conversationId: string): void {
    if (
      this.renameConversationId() !== conversationId ||
      this.isRenaming() ||
      this.isDeleting()
    ) {
      return;
    }

    if (this.renameTitle.invalid) {
      this.renameTitle.markAsTouched();
      return;
    }

    const title = this.renameTitle.value.trim();
    this.isRenaming.set(true);
    this.actionError.set(null);
    this.actionFeedback.set(null);

    this.conversationsApi
      .updateConversation(conversationId, { title })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isRenaming.set(false)),
      )
      .subscribe({
        next: (conversation) => this.onConversationRenamed(conversation),
        error: (error: unknown) => {
          this.actionError.set(
            getActionErrorMessage(error, 'Impossible de renommer cette conversation.'),
          );
        },
      });
  }

  requestDeleteConfirmation(conversationId: string): void {
    if (this.isRenaming() || this.isDeleting()) {
      return;
    }

    this.actionError.set(null);
    this.actionFeedback.set(null);
    this.pendingDeleteConversationId.set(conversationId);
  }

  cancelDelete(): void {
    if (!this.isDeleting()) {
      this.pendingDeleteConversationId.set(null);
    }
  }

  confirmDelete(conversationId: string): void {
    if (
      this.pendingDeleteConversationId() !== conversationId ||
      this.isDeleting() ||
      this.isRenaming()
    ) {
      return;
    }

    this.isDeleting.set(true);
    this.actionError.set(null);
    this.actionFeedback.set(null);

    this.conversationsApi
      .deleteConversation(conversationId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDeleting.set(false)),
      )
      .subscribe({
        next: () => this.onConversationDeleted(conversationId),
        error: (error: unknown) => {
          this.actionError.set(
            getActionErrorMessage(error, 'Impossible de supprimer cette conversation.'),
          );
        },
      });
  }

  loadFirstPage(): void {
    this.loadPage(0);
  }

  loadNextPage(): void {
    if (
      !this.hasNextPage() ||
      this.isInitialLoading() ||
      this.isLoadingMore()
    ) {
      return;
    }

    this.loadPage(this.nextOffset());
  }

  retry(): void {
    if (this.hasLoaded()) {
      this.loadNextPage();
    } else {
      this.loadFirstPage();
    }
  }

  loadAllAvailable(): void {
    if (!this.hasNextPage() || this.isInitialLoading() || this.isLoadingMore()) {
      return;
    }

    this.loadNextPage();
  }

  private onConversationRenamed(conversation: Conversation): void {
    this.renameConversationId.set(null);
    this.renameTitle.reset('');
    this.actionFeedback.set('La conversation a été renommée.');

    // Le serveur trie par updated_at ; on recharge pour respecter son ordre.
    this.refreshHistory();
  }

  private onConversationDeleted(conversationId: string): void {
    const remainingConversations = this.conversations().filter(
      (conversation) => conversation.id !== conversationId,
    );
    const remainingTotal = Math.max(0, this.total() - 1);

    this.conversations.set(remainingConversations);
    this.total.set(remainingTotal);
    this.nextOffset.set(remainingConversations.length);
    this.pendingDeleteConversationId.set(null);
    this.actionFeedback.set('La conversation a été supprimée.');

    // La sidebar du shell recharge sa page de récents sans reload global.
    this.chatConversation.notifyHistoryChanged();

    if (this.activeId() === conversationId) {
      this.localSelection.set(null);
      this.conversationDeleted.emit(conversationId);
    }

    if (remainingConversations.length === 0 && remainingTotal > 0) {
      this.refreshHistory();
    }
  }

  private refreshHistory(): void {
    this.conversations.set([]);
    this.total.set(0);
    this.nextOffset.set(0);
    this.hasLoaded.set(false);
    this.loadFirstPage();
  }

  private loadPage(offset: number): void {
    const isFirstPage = offset === 0;

    this.loadError.set(null);
    if (isFirstPage) {
      this.isInitialLoading.set(true);
    } else {
      this.isLoadingMore.set(true);
    }

    this.conversationsApi
      .getRecentConversations({
        limit: CONVERSATIONS_PAGE_SIZE,
        offset,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isInitialLoading.set(false);
          this.isLoadingMore.set(false);
        }),
      )
      .subscribe({
        next: (page) => {
          this.conversations.update((current) =>
            isFirstPage ? page.items : [...current, ...page.items],
          );
          this.total.set(page.total);
          this.nextOffset.set(page.offset + page.limit);
          this.hasLoaded.set(true);
        },
        error: () => {
          this.loadError.set('Impossible de charger l’historique. Réessayez.');
        },
      });
  }
  private refreshHistoryAfterCreation(): void {
    // Réinitialise l'état de pagination pour que la nouvelle première page
    // vienne du serveur, où la conversation créée est en tête.
    this.searchTerm.set('');
    this.conversations.set([]);
    this.total.set(0);
    this.nextOffset.set(0);
    this.hasLoaded.set(false);
    this.loadError.set(null);

    this.loadFirstPage();
  }

  private matchesDateFilter(conversation: ConversationListItem): boolean {
    const filter = this.dateFilter();
    if (filter === 'all') {
      return true;
    }

    const timestamp = conversation.lastMessageAt;
    if (!timestamp) {
      return false;
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const now = new Date();
    if (filter === 'today') {
      return date.toDateString() === now.toDateString();
    }

    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return date >= weekAgo;
  }

  private matchesProviderFilter(conversation: ConversationListItem): boolean {
    const filter = this.providerFilter();
    if (filter === 'all') {
      return true;
    }

    return conversation.providerId.toLocaleLowerCase().includes(filter);
  }
}

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) {
      return 'Cette conversation n’est plus disponible.';
    }
    if (error.status === 400 || error.status === 422) {
      return 'Le titre fourni n’est pas valide.';
    }
    if (error.status === 401) {
      return 'Votre session a expiré. Reconnectez-vous.';
    }
  }

  return fallback;
}

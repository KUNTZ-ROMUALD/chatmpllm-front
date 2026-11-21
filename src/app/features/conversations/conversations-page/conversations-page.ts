import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { SessionService } from '../../../core/auth/session.service';
import { ConversationSidebar } from '../conversation-sidebar/conversation-sidebar';

@Component({
  selector: 'app-conversations-page',
  standalone: true,
  imports: [
    ConversationSidebar,
    MatButtonModule,
    MatIconModule,
    RouterLink,
  ],
  templateUrl: './conversations-page.html',
  styleUrl: './conversations-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationsPage {
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);

  readonly isAuthenticated = computed(() => this.sessionService.isAuthenticated());

  openConversation(conversationId: string): void {
    void this.router.navigate(['/chat'], {
      queryParams: { conversationId },
    });
  }
}

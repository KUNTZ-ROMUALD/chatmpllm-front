import {Component, computed, DestroyRef, inject, signal,OnInit} from '@angular/core';
import {SessionService} from '../../../core/auth/session.service';
import {AuthApiService} from '../../../core/auth/auth-api.service';
import {Router, RouterLink, RouterLinkActive, RouterOutlet,NavigationEnd} from '@angular/router';
import {APP_NAV_ITEMS, AppNavItem} from '../../navigation/app-navigation.config';
import {catchError, finalize, of,filter} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import { MatSidenavModule} from '@angular/material/sidenav';
import {MatListModule} from '@angular/material/list';
import {MatIcon, MatIconModule} from '@angular/material/icon';
import {MatToolbarModule, MatToolbarRow} from '@angular/material/toolbar';
import {NgClass} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDividerModule} from '@angular/material/divider';
import {MatMenuModule} from '@angular/material/menu';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';

import { ChatConversationService } from '../../../features/chat/chat-conversation.service';
import { ChatHistorySidebar } from '../../../features/chat/chat-history-sidebar/chat-history-sidebar';

@Component({
  selector: 'app-app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    ChatHistorySidebar,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell  implements OnInit{
  private readonly sessionService = inject(SessionService);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private readonly chatConversation = inject(ChatConversationService);


  readonly isDrawerOpen = signal(true);
  readonly  isLoggingOut = signal(false);

  readonly user = this.sessionService.user;
  readonly isAuthenticated = this.sessionService.isAuthenticated;
  readonly  sessionStatus = this.sessionService.status;
  readonly isAnonymous = this.sessionService.isAnonymous;
  readonly activeChatConversationId = this.chatConversation.conversationId;
  readonly isChatRoute = signal(false);

  readonly appNavItems = APP_NAV_ITEMS;

  readonly currentUserLabel = computed(()=>{
    const user = this.user();
    return user?.displayName?.trim() || user?.email || "invité";
  })

  readonly sessionLabel = computed(()=>{
    if (this.sessionService.isAuthenticated()) {
      return 'Connecté';
    }
    if(this.sessionService.isLoading()){
      return 'Chargement de session ...';
    }
    if (this.sessionService.hasError()){
      return "Session instable"
    }
    return "Mode invité"
  });

  readonly isAdmin =  computed(()=> this.user()?.role==="admin");

  readonly visibleNavItems = computed(()=>
    APP_NAV_ITEMS.filter((item) => this.canDisplayNavItem(item)),);


  ngOnInit(): void {
    this.updateChatRoute();

    this.router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.updateChatRoute());
  }

  startNewConversationFromSidebar(): void {
    if (this.isChatRoute()) {
      this.chatConversation.requestNewConversation();
      return;
    }

    this.chatConversation.resetToDraft();

    void this.router.navigate(['/chat'], {
      queryParams: {},
    });
  }

  openChatConversation(conversationId: string): void {
    void this.router.navigate(['/chat'], {
      queryParams: { conversationId },
    });
  }

  private updateChatRoute(): void {
    const currentPath = this.router.url.split(/[?#]/)[0] ?? '';
    this.isChatRoute.set(currentPath === '/chat');
  }



  toggleDrawer() {
    this.isDrawerOpen.update((current)=> !current);
  }

  closeDrawer(){
    this.isDrawerOpen.set(false);
  }

  logout() : void {
    this.isLoggingOut.set(true);

    this.authApi.logout()
      .pipe(
        catchError(() => of(null)),
        finalize(() => this.isLoggingOut.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(
        () => {
          this.sessionService.clearSessionState();
          void this.router.navigate(['/auth/login']);
        })
  }

  trackByRoute(_index:number,item : AppNavItem) : string {
    return item.route
  }

  openLogin() : void {
    void this.router.navigate(['/auth/login']);
  }

  openRegister() : void {
    void this.router.navigate(['/auth/register']);
  }

  private canDisplayNavItem(item : AppNavItem) : boolean{
    if (item.adminOnly){
      return this.isAdmin();
    }

    if (item.requiresAuth) {
      return this.isAuthenticated();
    }

    return true;
  }
}

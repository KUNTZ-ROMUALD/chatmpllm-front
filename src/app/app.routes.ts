import {Routes} from '@angular/router';
import {LandingPage} from './features/landing/landing-page/landing-page';
import {adminGuard, anonymousOnlyGuard} from './core/auth/route-access.guard';
import {NotFound} from './features/not-found/not-found';
import {AppShell} from './layout/shell/app-shell/app-shell';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: LandingPage,
  },
  {
    path: 'auth',
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'login',
      },
      {
        path: 'login',
        canActivate: [anonymousOnlyGuard],
        loadComponent: () =>
          import('./features/auth/login/login').then((m) => m.Login),
      },
      {
        path: 'register',
        canActivate: [anonymousOnlyGuard],
        loadComponent: () =>
          import('./features/auth/register/register').then((m) => m.Register),
      },
    ],
  },
  {
    path: '',
    component: AppShell,
    children: [
      {
        path: 'chat',
        loadComponent: () =>
          import('./features/chat/chat-dashboard/chat-dashboard').then((m) => m.ChatDashboard),
      },
      {
        path: 'settings',
        redirectTo: 'api-keys',
        pathMatch: 'full',
      },
      {
        path: 'conversations',
        loadComponent: () =>
          import('./features/conversations/conversations-page/conversations-page').then(
            (m) => m.ConversationsPage,
          ),
      },
      {
        path: 'api-keys',
        loadComponent: () =>
          import('./features/api-keys/api-keys-page/api-keys-page').then((m) => m.ApiKeysPage),
      },
      {
        path: 'providers',
        loadComponent: () =>
          import('./features/providers/providers-page/providers-page').then(
            (m) => m.ProvidersPage,
          ),
      },
      {
        path: 'admin/providers',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/providers/admin-providers-page/admin-providers-page').then(
            (m) => m.AdminProvidersPage,
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'chat',
      },
    ],
  },
  {
    path: '**',
    component: NotFound,
  },
];

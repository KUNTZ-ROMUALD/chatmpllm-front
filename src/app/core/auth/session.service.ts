import { HttpErrorResponse, HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, defer, of, shareReplay, switchMap, tap } from 'rxjs';
import { SessionStatus, User } from './models/auth.models';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly statusSignal = signal<SessionStatus>('idle');
  private readonly userSignal = signal<User | null>(null);
  private readonly errorMessageSignal = signal<string | null>(null);

  private sessionLoadRequest$: Observable<User | null> | null = null;

  readonly status = this.statusSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly errorMessage = this.errorMessageSignal.asReadonly();

  readonly isAuthenticated = computed(() => this.status() === 'authenticated' && this.user() !== null);
  readonly isAnonymous = computed(() => this.status() === 'anonymous');
  readonly isLoading = computed(() => this.status() === 'loading');
  readonly hasError = computed(() => this.status() === 'error');

  readonly displayName = computed(() => {
    const user = this.user();
    if (!user) {
      return 'Invité';
    }
    return user.displayName ?? user.email;
  });

  initializeSession(): Observable<User | null> {
    if (this.sessionLoadRequest$) {
      return this.sessionLoadRequest$;
    }

    this.statusSignal.set('loading');
    this.errorMessageSignal.set(null);

    this.sessionLoadRequest$ = defer(() =>
      this.http.get<{ csrf_token: string }>('/api/v1/auth/csrf', { withCredentials: true }),
    ).pipe(
      switchMap(() =>
        this.http.get<User>('/api/v1/auth/me', { withCredentials: true }),
      ),
      tap((user) => {
        this.userSignal.set(user);
        this.statusSignal.set('authenticated');
        this.errorMessageSignal.set(null);
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.setAnonymousState();
        } else {
          this.setErrorState(this.resolveErrorMessage(error));
        }

        return of(null);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.sessionLoadRequest$;
  }

  reloadSession(): Observable<User | null> {
    this.resetCachedSessionLoad();
    return this.initializeSession();
  }

  setAnonymousState(): void {
    this.userSignal.set(null);
    this.statusSignal.set('anonymous');
    this.errorMessageSignal.set(null);
    this.resetCachedSessionLoad();
  }

  clearSessionState(): void {
    this.userSignal.set(null);
    this.statusSignal.set('anonymous');
    this.errorMessageSignal.set(null);
    this.resetCachedSessionLoad();
  }

  setAuthenticatedUser(user: User): void {
    this.userSignal.set(user);
    this.statusSignal.set('authenticated');
    this.errorMessageSignal.set(null);
  }

  setErrorState(message: string): void {
    this.userSignal.set(null);
    this.statusSignal.set('error');
    this.errorMessageSignal.set(message);
    this.resetCachedSessionLoad();
  }

  private resolveErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Impossible de contacter le serveur.';
    }

    return 'Impossible de restaurer la session.';
  }

  private resetCachedSessionLoad(): void {
    this.sessionLoadRequest$ = null;
  }
}

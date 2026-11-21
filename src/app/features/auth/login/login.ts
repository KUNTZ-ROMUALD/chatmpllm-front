import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, switchMap, tap } from 'rxjs';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthApiService } from '../../../core/auth/auth-api.service';
import { mapAuthErrorMessage } from '../../../core/auth/auth-error.mapper';
import { LoginRequest } from '../../../core/auth/models/auth.models';
import { SessionService } from '../../../core/auth/session.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly serverErrorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(
    this.route.snapshot.queryParamMap.get('registered') === '1'
      ? 'Compte créé avec succès. Vous pouvez maintenant vous connecter.'
      : null,
  );

  readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/chat';

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  get isSubmitDisabled(): boolean {
    return this.form.invalid || this.isSubmitting();
  }

  ngOnInit(): void {
    if (this.sessionService.isAuthenticated() ) {
      void this.router.navigateByUrl(this.returnUrl);
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.serverErrorMessage.set(null);

    const payload: LoginRequest = this.form.getRawValue();

    this.authApi
      .login(payload)
      .pipe(
        switchMap(() => this.sessionService.reloadSession()),
        tap((user) => {
          if (!user) {
            throw new Error('Session non restaurée après connexion.');
          }

          void this.router.navigateByUrl(this.returnUrl);
        }),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            this.serverErrorMessage.set(mapAuthErrorMessage(error));
          } else {
            this.serverErrorMessage.set('Connexion impossible.');
          }

          return EMPTY;
        }),
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}

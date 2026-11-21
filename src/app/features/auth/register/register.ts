import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { AbstractControl, ValidationErrors, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
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
import { RegisterRequest } from '../../../core/auth/models/auth.models';
import { SessionService } from '../../../core/auth/session.service';


function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value as string | undefined;
  const confirmPassword = control.get('confirmPassword')?.value as string | undefined;

  if (!password || !confirmPassword) {
    return null;
  }

  return password === confirmPassword ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-register',
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
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);
  readonly serverErrorMessage = signal<string | null>(null);
  readonly returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/chat';

  readonly form = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      displayName: ['', [Validators.maxLength(120)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatchValidator] },
  );

  get isSubmitDisabled(): boolean {
    return this.form.invalid || this.isSubmitting();
  }

  ngOnInit(): void {
    if (this.sessionService.isAuthenticated()) {
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

    const payload: RegisterRequest = {
      email: this.form.controls.email.value,
      display_name: this.form.controls.displayName.value,
      password: this.form.controls.password.value,
    };

    this.authApi
      .register(payload)
      .pipe(
        switchMap(() => this.sessionService.reloadSession()),
        tap((user) => {
          if (user) {
            void this.router.navigateByUrl(this.returnUrl);
            return;
          }

          void this.router.navigate(['/auth/login'], {
            queryParams: {
              registered: '1',
              email: payload.email,
            },
          });
        }),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            this.serverErrorMessage.set(mapAuthErrorMessage(error));
          } else {
            this.serverErrorMessage.set("L'inscription a échoué.");
          }

          return EMPTY;
        }),
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
}

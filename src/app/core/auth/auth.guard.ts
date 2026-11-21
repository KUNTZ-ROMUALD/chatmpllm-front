import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { SessionService } from './session.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const sessionService = inject(SessionService);
  const router = inject(Router);

  return sessionService.initializeSession().pipe(
    map(() => {
      if (sessionService.isAuthenticated()) {
        return true;
      }

      return router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      });
    }),
    catchError(() =>
      of(
        router.createUrlTree(['/auth/login'], {
          queryParams: { returnUrl: state.url },
        }),
      ),
    ),
  );
};

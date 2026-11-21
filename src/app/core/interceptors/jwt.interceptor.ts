import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { SessionService } from '../auth/session.service';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  private readonly sessionService = inject(SessionService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const securedRequest = req.clone({
      withCredentials: true,
    });

    return next.handle(securedRequest).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          this.sessionService.setAnonymousState();
        }

        return throwError(() => error);
      }),
    );
  }
}

import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withXsrfConfiguration,
} from '@angular/common/http';
import { provideAppInitializer, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { JwtInterceptor } from './core/interceptors/jwt.interceptor';
import { SessionService } from './core/auth/session.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withXsrfConfiguration({
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      }),
    ),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: JwtInterceptor,
      multi: true,
    },
    provideAppInitializer(() => {
      const sessionService = inject(SessionService);
      return firstValueFrom(sessionService.initializeSession()).then(() => void 0);
    }),
  ],
};

  import {ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
  import {provideHttpClient, withFetch, withInterceptors} from '@angular/common/http';
  import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
  import {credentialsInterceptor} from './core/interceptors/credentials.interceptor';
  import {csrfInterceptor} from './core/interceptors/csrf.interceptor';
  import {errorInterceptor} from './core/interceptors/error.interceptor';
  import {loadingInterceptor} from './core/interceptors/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(), provideRouter(routes),
    provideZoneChangeDetection({eventCoalescing:true}),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        credentialsInterceptor,
        csrfInterceptor,
        errorInterceptor,
        loadingInterceptor
      ]),
    ),
    provideAnimationsAsync(),
  ],
};

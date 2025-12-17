import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { apiResponseInterceptor } from './core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiResponseInterceptor])),
    provideAnimations(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark-theme'
        }
      }
    })
  ]
};

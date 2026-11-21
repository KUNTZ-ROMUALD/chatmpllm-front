import { HttpErrorResponse } from '@angular/common/http';

export function mapAuthErrorMessage(error: HttpErrorResponse): string {
  switch (error.status) {
    case 400:
      return 'Le formulaire contient des données invalides.';
    case 401:
      return 'Email ou mot de passe incorrect.';
    case 409:
      return 'Cet email est déjà utilisé.';
    case 429:
      return 'Trop de tentatives. Réessayez plus tard.';
    case 0:
      return 'Impossible de contacter le serveur.';
    default:
      return 'Une erreur inattendue est survenue.';
  }
}

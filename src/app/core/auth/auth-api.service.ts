import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest } from './models/auth.models';

@Injectable({
  providedIn: 'root',
})

export class AuthApiService {
  private readonly http = inject(HttpClient);

  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/login', payload);
  }

  register(payload: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/register', payload);
  }

  logout(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/logout', {});
  }

}

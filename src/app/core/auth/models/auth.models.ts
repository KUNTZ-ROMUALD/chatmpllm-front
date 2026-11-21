export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'admin' | string;
}

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface AuthResponse {
  message: string;
}

import {Platform} from 'react-native';
import {clearSession, readSession, writeSession} from './session';
import type {AuthTokens, EmailCodeChallenge, LoginResult} from './types';

const BASE_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:8080/api/v1'
  : 'http://localhost:8080/api/v1';

let currentSession: AuthTokens | null = null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function setSession(session: AuthTokens): Promise<void> {
  currentSession = session;
  await writeSession(session);
}

export async function loadSession(): Promise<AuthTokens | null> {
  currentSession = await readSession();
  return currentSession;
}

export async function forgetSession(): Promise<void> {
  currentSession = null;
  await clearSession();
}

async function decodeResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.detail ?? body?.title ?? `Request failed (${response.status}).`;
    throw new ApiError(response.status, message);
  }
  return body as T;
}

async function refreshTokens(): Promise<AuthTokens | null> {
  if (!currentSession?.refreshToken) {
    return null;
  }
  const response = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refreshToken: currentSession.refreshToken}),
  });
  if (!response.ok) {
    await forgetSession();
    return null;
  }
  const next = await decodeResponse<AuthTokens>(response);
  await setSession(next);
  return next;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const execute = (token: string | null) => fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
      ...(authenticated && token ? {Authorization: `Bearer ${token}`} : {}),
    },
  });

  let response = await execute(currentSession?.accessToken ?? null);
  if (authenticated && response.status === 401 && currentSession?.refreshToken) {
    const next = await refreshTokens();
    if (next) {
      response = await execute(next.accessToken);
    }
  }
  return decodeResponse<T>(response);
}

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const result = await apiRequest<LoginResult>('/auth/login', {
    method: 'POST', body: JSON.stringify({identifier, password}),
  }, false);
  if (result.tokens) await setSession(result.tokens);
  return result;
}

export async function register(email: string, password: string): Promise<EmailCodeChallenge> {
  return apiRequest<EmailCodeChallenge>('/auth/register', {
    method: 'POST', body: JSON.stringify({email, password}),
  }, false);
}

export async function verifyEmailCode(challengeToken: string, code: string): Promise<AuthTokens> {
  const tokens = await apiRequest<AuthTokens>('/auth/email-code/verify', {
    method: 'POST', body: JSON.stringify({token: challengeToken, code}),
  }, false);
  await setSession(tokens);
  return tokens;
}

export async function resendEmailCode(challengeToken: string): Promise<EmailCodeChallenge> {
  return apiRequest<EmailCodeChallenge>('/auth/email-code/resend', {
    method: 'POST', body: JSON.stringify({token: challengeToken}),
  }, false);
}

export async function loginWithGoogle(idToken: string): Promise<LoginResult> {
  const result = await apiRequest<LoginResult>('/auth/google', {
    method: 'POST', body: JSON.stringify({idToken}),
  }, false);
  if (result.tokens) await setSession(result.tokens);
  return result;
}

export async function logout(): Promise<void> {
  const refreshToken = currentSession?.refreshToken;
  if (refreshToken) {
    await apiRequest<void>('/auth/logout', {
      method: 'POST', body: JSON.stringify({refreshToken}),
    }).catch(() => undefined);
  }
  await forgetSession();
}

export function getBaseUrl(): string { return BASE_URL; }

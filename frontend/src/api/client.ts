export const API_URL = '/api';
export const AUTH_EXPIRED_EVENT = 'documentarno:auth-expired';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
};

const getJwtPayload = (token: string): { exp?: number } | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    return JSON.parse(decodeBase64Url(payload)) as { exp?: number };
  } catch {
    return null;
  }
};

export const getTokenExpirationTime = (token: string): number | null => {
  const payload = getJwtPayload(token);
  return payload?.exp ? payload.exp * 1000 : null;
};

export const clearAuthToken = (): void => {
  localStorage.removeItem('token');
};

export const isTokenExpired = (token: string): boolean => {
  const expirationTime = getTokenExpirationTime(token);
  if (!expirationTime) {
    return true;
  }

  return expirationTime <= Date.now();
};

export const getAuthToken = (): string | null => {
  const token = localStorage.getItem('token');
  if (!token) {
    return null;
  }

  if (isTokenExpired(token)) {
    clearAuthToken();
    return null;
  }

  return token;
};

export const notifyAuthExpired = (): void => {
  clearAuthToken();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
};

export const handleUnauthorizedStatus = (status: number): void => {
  if (status === 401) {
    notifyAuthExpired();
  }
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

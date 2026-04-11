import { API_URL, getAuthHeaders, ApiError } from './client';
import { LoginRequest, TokenResponse } from '../types/auth';

export const login = async (data: LoginRequest): Promise<TokenResponse> => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(response.status, errorData.detail || 'Login failed');
  }

  return response.json();
};

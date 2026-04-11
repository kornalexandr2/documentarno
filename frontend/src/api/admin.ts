import { API_URL, getAuthHeaders, ApiError } from './client';

export const triggerLockdown = async (): Promise<void> => {
  const response = await fetch(`${API_URL}/system/metrics/lockdown`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new ApiError(response.status, 'Failed to trigger lockdown');
};

export const triggerUnlock = async (): Promise<void> => {
  const response = await fetch(`${API_URL}/system/metrics/unlock`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new ApiError(response.status, 'Failed to remove lockdown');
};

export const kickAllUsers = async (): Promise<void> => {
  const response = await fetch(`${API_URL}/auth/kick_all`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new ApiError(response.status, 'Failed to kick users');
};

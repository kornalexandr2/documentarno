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

export const getSystemState = async (): Promise<{ state: string }> => {
  const response = await fetch(`${API_URL}/system/metrics/state`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Failed to get system state');
  }
  return response.json();
};

export const setSystemState = async (state: string): Promise<{ status: string }> => {
  const response = await fetch(`${API_URL}/system/metrics/state?new_state=${state}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Failed to set system state');
  }
  return response.json();
};

export const getSystemLogs = async (lines = 100, level?: string): Promise<{ logs: string }> => {
  let url = `${API_URL}/system/metrics/logs?lines=${lines}`;
  if (level) url += `&level=${level}`;
  
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Failed to get system logs');
  }
  return response.json();
};

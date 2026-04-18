import { API_URL, ApiError, getAuthHeaders, handleUnauthorizedStatus } from './client';

export interface AppSettings {
  system_prompt?: string;
  sync_mode?: string;
  default_model?: string;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
}

export const getPrompt = async (): Promise<{ prompt: string }> => {
  const response = await fetch(`${API_URL}/settings/prompt`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    handleUnauthorizedStatus(response.status);
    throw new ApiError(response.status, 'Failed to fetch prompt');
  }
  return response.json();
};

export const updatePrompt = async (prompt: string): Promise<{ prompt: string }> => {
  const response = await fetch(`${API_URL}/settings/prompt`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    handleUnauthorizedStatus(response.status);
    throw new ApiError(response.status, 'Failed to update prompt');
  }
  return response.json();
};

export const getAppSettings = async (): Promise<AppSettings> => {
  const response = await fetch(`${API_URL}/settings/all`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    handleUnauthorizedStatus(response.status);
    throw new ApiError(response.status, 'Failed to fetch settings');
  }
  return response.json();
};

export const updateAppSettings = async (settings: AppSettings): Promise<AppSettings> => {
  const response = await fetch(`${API_URL}/settings/all`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    handleUnauthorizedStatus(response.status);
    throw new ApiError(response.status, 'Failed to update settings');
  }
  return response.json();
};

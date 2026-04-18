import { API_URL, ApiError, getAuthHeaders, handleUnauthorizedStatus } from './client';
import { ModelListResponse } from '../types/models';

export const getModels = async (): Promise<ModelListResponse> => {
  const response = await fetch(`${API_URL}/models`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    handleUnauthorizedStatus(response.status);
    throw new ApiError(response.status, 'Failed to fetch models');
  }

  return response.json();
};

export const pullModel = async (modelName: string): Promise<{ status: string }> => {
  const response = await fetch(`${API_URL}/models/pull`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ model_name: modelName }),
  });

  if (!response.ok) {
    handleUnauthorizedStatus(response.status);
    const err = await response.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(response.status, err.detail || 'Failed to pull model');
  }

  return response.json();
};

export const uploadModel = async (file: File, modelName: string): Promise<{ status: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model_name', modelName);

  const headers: Record<string, string> = getAuthHeaders();
  delete headers['Content-Type'];

  const response = await fetch(`${API_URL}/models/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    handleUnauthorizedStatus(response.status);
    const err = await response.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(response.status, err.detail || 'Failed to upload model');
  }

  return response.json();
};

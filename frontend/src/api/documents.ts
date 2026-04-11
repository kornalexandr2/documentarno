import { API_URL, ApiError, getAuthHeaders } from './client';
import { DocumentItem } from '../types/documents';

export const getDocuments = async (): Promise<DocumentItem[]> => {
  const response = await fetch(`${API_URL}/documents`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new ApiError(response.status, 'Failed to fetch documents');
  }
  return response.json();
};

export const uploadDocument = async (file: File, priority: string = 'NORMAL'): Promise<DocumentItem> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('priority', priority);

  const headers: Record<string, string> = getAuthHeaders();
  delete headers['Content-Type'];

  const response = await fetch(`${API_URL}/documents/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(response.status, err.detail || 'Failed to upload document');
  }

  return response.json();
};

export const deleteDocument = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/documents/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(response.status, err.detail || 'Failed to delete document');
  }
};

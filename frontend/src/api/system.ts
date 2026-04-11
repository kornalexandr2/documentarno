import { API_URL, getAuthHeaders, ApiError } from './client';

export interface SystemMetricHistory {
  recorded_at: string;
  cpu: number;
  ram: number;
  gpu: number | null;
  vram_used: number | null;
  vram_total: number | null;
  disk_system_used_gb: number;
  disk_system_total_gb: number;
  disk_source_used_gb: number;
  disk_source_total_gb: number;
}

export const getMetricsHistory = async (period: string = '24h'): Promise<SystemMetricHistory[]> => {
  const response = await fetch(`${API_URL}/system/metrics/history?period=${period}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new ApiError(response.status, 'Failed to fetch metrics history');
  }

  return response.json();
};

export const getWebSocketUrl = (): string | null => {
  const token = localStorage.getItem('token');
  if (!token) {
    return null; // No token, cannot establish WebSocket connection
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host; // This includes port (e.g., localhost:8080)
  return `${protocol}//${host}/ws/system/metrics/live?token=${token}`;
};

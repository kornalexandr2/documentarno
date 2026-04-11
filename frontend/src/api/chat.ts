import { API_URL, ApiError, getAuthHeaders } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const parseSseEvent = (eventChunk: string): { text?: string; error?: string } | null => {
  const lines = eventChunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLine = lines.find((line) => line.startsWith('data: '));
  if (!dataLine) {
    return null;
  }

  return JSON.parse(dataLine.slice(6)) as { text?: string; error?: string };
};

export const sendChatMessage = async (
  message: string,
  documentId?: number,
  modelName?: string,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, document_id: documentId, model_name: modelName }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(response.status, err.detail || 'Chat request failed');
  }

  if (!response.body) {
    throw new Error('ReadableStream not yet supported in this browser.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n/g, '\n');

    let delimiterIndex = buffer.indexOf('\n\n');
    while (delimiterIndex !== -1) {
      const rawEvent = buffer.slice(0, delimiterIndex).trim();
      buffer = buffer.slice(delimiterIndex + 2);

      if (rawEvent) {
        const data = parseSseEvent(rawEvent);
        if (data?.error) {
          throw new Error(data.error);
        }
        if (data?.text) {
          fullResponse += data.text;
          onChunk?.(fullResponse);
        }
      }

      delimiterIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const data = parseSseEvent(buffer.trim());
    if (data?.error) {
      throw new Error(data.error);
    }
    if (data?.text) {
      fullResponse += data.text;
      onChunk?.(fullResponse);
    }
  }

  return fullResponse;
};

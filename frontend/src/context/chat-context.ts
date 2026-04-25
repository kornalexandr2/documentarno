import { createContext, useContext } from 'react';

import type { DocumentItem } from '../types/documents';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  selectedDocId: number | null;
  activePdfPage: number;
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
}

export interface ChatContextType {
  conversations: ChatConversation[];
  activeConversationId: string;
  activeConversation: ChatConversation;
  documents: DocumentItem[];
  documentsLoading: boolean;
  isAnyConversationLoading: boolean;
  createConversation: () => void;
  selectConversation: (conversationId: string) => void;
  setConversationInput: (conversationId: string, input: string) => void;
  setConversationDocument: (conversationId: string, documentId: number | null) => void;
  setConversationPdfPage: (conversationId: string, page: number) => void;
  sendMessage: (conversationId: string) => Promise<void>;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

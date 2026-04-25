import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getDocuments } from '../api/documents';
import { sendChatMessage } from '../api/chat';
import { getErrorMessage } from '../api/client';
import type { DocumentItem } from '../types/documents';
import { useAuth } from './auth-context';
import { ChatContext, type ChatConversation } from './chat-context';

interface PersistedChatState {
  conversations: ChatConversation[];
  activeConversationId: string;
}

const STORAGE_KEY = 'documentarno.chat.state.v1';

const createId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const buildWelcomeMessage = (welcomeText: string) => ({
  id: createId(),
  role: 'assistant' as const,
  content: welcomeText,
});

const createConversationState = (welcomeText: string, selectedDocId: number | null = null): ChatConversation => {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    selectedDocId,
    activePdfPage: 1,
    messages: [buildWelcomeMessage(welcomeText)],
    input: '',
    isLoading: false,
  };
};

const normalizeState = (rawState: PersistedChatState | null, welcomeText: string): PersistedChatState => {
  if (!rawState?.conversations?.length) {
    const conversation = createConversationState(welcomeText);
    return {
      conversations: [conversation],
      activeConversationId: conversation.id,
    };
  }

  const conversations = rawState.conversations.map((conversation) => ({
    ...conversation,
    input: conversation.input ?? '',
    isLoading: false,
    activePdfPage: conversation.activePdfPage ?? 1,
    selectedDocId: conversation.selectedDocId ?? null,
    messages:
      conversation.messages?.length > 0
        ? conversation.messages
        : [buildWelcomeMessage(welcomeText)],
  }));

  const activeConversationId = conversations.some((conversation) => conversation.id === rawState.activeConversationId)
    ? rawState.activeConversationId
    : conversations[0].id;

  return { conversations, activeConversationId };
};

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const welcomeText = t('chat.welcome');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [chatState, setChatState] = useState<PersistedChatState>(() => {
    if (typeof window === 'undefined') {
      return normalizeState(null, welcomeText);
    }

    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY);
      if (!storedValue) {
        return normalizeState(null, welcomeText);
      }

      return normalizeState(JSON.parse(storedValue) as PersistedChatState, welcomeText);
    } catch (error) {
      console.error('Failed to restore chat state:', error);
      return normalizeState(null, welcomeText);
    }
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setDocuments([]);
      setDocumentsLoading(false);
      return;
    }

    setDocumentsLoading(true);

    getDocuments()
      .then((docs) => {
        const completedDocs = docs.filter((doc) => doc.status === 'COMPLETED');
        setDocuments(completedDocs);

        setChatState((current) => {
          const defaultDocId = completedDocs[0]?.id ?? null;
          const conversations = current.conversations.map((conversation) => {
            if (conversation.selectedDocId !== null) {
              const exists = completedDocs.some((doc) => doc.id === conversation.selectedDocId);
              if (exists) {
                return conversation;
              }
            }

            return {
              ...conversation,
              selectedDocId: defaultDocId,
              activePdfPage: 1,
            };
          });

          return { ...current, conversations };
        });
      })
      .catch((err: unknown) => {
        console.error('Failed to load documents:', err);
      })
      .finally(() => {
        setDocumentsLoading(false);
      });
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const serializableState: PersistedChatState = {
      conversations: chatState.conversations.map((conversation) => ({
        ...conversation,
        isLoading: false,
      })),
      activeConversationId: chatState.activeConversationId,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState));
  }, [chatState]);

  const createConversation = useCallback(() => {
    const defaultDocId = documents[0]?.id ?? null;
    const conversation = createConversationState(welcomeText, defaultDocId);
    setChatState((current) => ({
      conversations: [conversation, ...current.conversations],
      activeConversationId: conversation.id,
    }));
  }, [documents, welcomeText]);

  const selectConversation = useCallback((conversationId: string) => {
    setChatState((current) => ({
      ...current,
      activeConversationId: conversationId,
    }));
  }, []);

  const setConversationInput = useCallback((conversationId: string, input: string) => {
    setChatState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, input } : conversation
      ),
    }));
  }, []);

  const setConversationDocument = useCallback((conversationId: string, documentId: number | null) => {
    setChatState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, selectedDocId: documentId, activePdfPage: 1, updatedAt: new Date().toISOString() }
          : conversation
      ),
    }));
  }, []);

  const setConversationPdfPage = useCallback((conversationId: string, page: number) => {
    setChatState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, activePdfPage: page } : conversation
      ),
    }));
  }, []);

  const sendMessage = useCallback(async (conversationId: string) => {
    const conversation = chatState.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return;
    }

    const userMessage = conversation.input.trim();
    if (!userMessage || conversation.selectedDocId === null) {
      return;
    }

    const userMessageId = createId();
    const assistantMessageId = createId();
    const now = new Date().toISOString();

    setChatState((current) => ({
      ...current,
      conversations: current.conversations.map((item) => {
        if (item.id !== conversationId) {
          return item;
        }

        return {
          ...item,
          title: item.messages.length <= 1 ? userMessage.slice(0, 60) : item.title,
          input: '',
          updatedAt: now,
          isLoading: true,
          messages: [
            ...item.messages,
            { id: userMessageId, role: 'user', content: userMessage },
            { id: assistantMessageId, role: 'assistant', content: '' },
          ],
        };
      }),
    }));

    try {
      await sendChatMessage(userMessage, conversation.selectedDocId, undefined, (chunk) => {
        setChatState((current) => ({
          ...current,
          conversations: current.conversations.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  updatedAt: new Date().toISOString(),
                  messages: item.messages.map((message) =>
                    message.id === assistantMessageId ? { ...message, content: chunk } : message
                  ),
                }
              : item
          ),
        }));
      });
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, t('chat.error_response'));
      setChatState((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                updatedAt: new Date().toISOString(),
                messages: item.messages.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content: `**${t('common.error')}** ${errorMessage}` }
                    : message
                ),
              }
            : item
        ),
      }));
    } finally {
      setChatState((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item.id === conversationId ? { ...item, isLoading: false } : item
        ),
      }));
    }
  }, [chatState.conversations, t]);

  const activeConversation =
    chatState.conversations.find((conversation) => conversation.id === chatState.activeConversationId) ??
    chatState.conversations[0];

  const isAnyConversationLoading = useMemo(
    () => chatState.conversations.some((conversation) => conversation.isLoading),
    [chatState.conversations]
  );

  return (
    <ChatContext.Provider
      value={{
        conversations: chatState.conversations,
        activeConversationId: chatState.activeConversationId,
        activeConversation,
        documents,
        documentsLoading,
        isAnyConversationLoading,
        createConversation,
        selectConversation,
        setConversationInput,
        setConversationDocument,
        setConversationPdfPage,
        sendMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

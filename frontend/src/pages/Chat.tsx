import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { API_URL } from '../api/client';
import PDFViewer from '../components/PDFViewer';
import { useChat } from '../context/chat-context';

const buildPdfUrl = (docId: number): string => `${API_URL}/documents/${docId}/download`;

const RAGChat: React.FC = () => {
  const { t } = useTranslation();
  const {
    conversations,
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
  } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation.messages]);

  const handleDocChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const docId = Number.parseInt(e.target.value, 10);
    if (!Number.isNaN(docId)) {
      setConversationDocument(activeConversation.id, docId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(activeConversation.id);
  };

  const handleLinkClick = (href: string | undefined) => {
    if (href && href.startsWith('#page=')) {
      const page = Number.parseInt(href.split('=')[1], 10);
      if (!Number.isNaN(page)) {
        setConversationPdfPage(activeConversation.id, page);
      }
    }
  };

  const markdownComponents: Components = {
    a: ({ href, ...props }) => (
      <a
        {...props}
        href={href}
        className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
        onClick={(event) => {
          event.preventDefault();
          handleLinkClick(href);
        }}
      />
    ),
  };

  const activePdfUrl = activeConversation.selectedDocId ? buildPdfUrl(activeConversation.selectedDocId) : null;

  return (
    <div className="flex h-full text-white bg-gray-900 p-4 gap-4">
      <aside className="w-72 flex-shrink-0 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 bg-gray-900">
          <button
            type="button"
            onClick={createConversation}
            className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {t('chat.new_chat')}
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-73px)] p-3 space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => selectConversation(conversation.id)}
              className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
                conversation.id === activeConversation.id
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-gray-900/70 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'
              }`}
            >
              <div className="text-sm font-medium truncate">
                {conversation.title || t('chat.new_chat')}
              </div>
              <div className="text-xs text-gray-400 mt-1 truncate">
                {conversation.messages[conversation.messages.length - 1]?.content || t('chat.empty_history')}
              </div>
              {conversation.isLoading && (
                <div className="text-[11px] text-blue-300 mt-2">{t('chat.generating')}</div>
              )}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex gap-4">
        <div className="w-1/2 min-w-0 flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 bg-gray-900 flex justify-between items-center gap-3">
            <div>
              <h2 className="text-xl font-bold">{t('chat.title')}</h2>
              <p className="text-xs text-gray-400 mt-1">{t('chat.history')}</p>
            </div>

            <select
              value={activeConversation.selectedDocId || ''}
              onChange={handleDocChange}
              className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500 max-w-[250px]"
              disabled={documentsLoading || documents.length === 0}
            >
              <option value="" disabled>{t('chat.select_doc')}</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.filename}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeConversation.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-gray-700 text-gray-200 rounded-bl-none border border-gray-600'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      className="prose prose-invert prose-sm max-w-none"
                      components={markdownComponents}
                    >
                      {msg.content}
                    </Markdown>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-700 bg-gray-900">
            {isAnyConversationLoading && activeConversation.isLoading === false && (
              <div className="text-xs text-blue-300 mb-3">{t('chat.background_notice')}</div>
            )}

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={activeConversation.input}
                onChange={(e) => setConversationInput(activeConversation.id, e.target.value)}
                placeholder={t('chat.placeholder')}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isAnyConversationLoading || activeConversation.selectedDocId === null}
              />
              <button
                type="submit"
                disabled={isAnyConversationLoading || !activeConversation.input.trim() || activeConversation.selectedDocId === null}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {activeConversation.isLoading ? t('chat.generating') : t('chat.send')}
              </button>
            </form>
          </div>
        </div>

        <div className="w-1/2 h-full">
          {activePdfUrl ? (
            <PDFViewer url={activePdfUrl} pageNumber={activeConversation.activePdfPage} />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-800 rounded-lg border border-gray-700 text-gray-500">
              {t('pdf.no_selection')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RAGChat;

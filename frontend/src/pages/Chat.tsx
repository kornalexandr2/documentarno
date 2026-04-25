import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { API_URL, getErrorMessage } from '../api/client';
import { sendChatMessage } from '../api/chat';
import PDFViewer from '../components/PDFViewer';
import { getDocuments } from '../api/documents';
import { DocumentItem } from '../types/documents';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const buildPdfUrl = (docId: number): string => `${API_URL}/documents/${docId}/download`;

const RAGChat: React.FC = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: t('chat.welcome') },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfPage, setActivePdfPage] = useState<number>(1);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectDocument = (docId: number) => {
    setSelectedDocId(docId);
    setActivePdfUrl(buildPdfUrl(docId));
    setActivePdfPage(1);
  };

  useEffect(() => {
    getDocuments()
      .then((docs) => {
        const completedDocs = docs.filter((doc) => doc.status === 'COMPLETED');
        setDocuments(completedDocs);
        if (completedDocs.length > 0) {
          selectDocument(completedDocs[0].id);
        } else {
          setSelectedDocId(null);
          setActivePdfUrl(null);
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to load documents:', err);
      });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDocChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const docId = Number.parseInt(e.target.value, 10);
    if (!Number.isNaN(docId)) {
      selectDocument(docId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || selectedDocId === null) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setLoading(true);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

    try {
      await sendChatMessage(userMsg, selectedDocId, undefined, (chunk) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: chunk } : msg
          )
        );
      });
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err, t('chat.error_response'));
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, content: `**${t('common.error')}** ${errorMessage}` } : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLinkClick = (href: string | undefined) => {
    if (href && href.startsWith('#page=')) {
      const page = Number.parseInt(href.split('=')[1], 10);
      if (!Number.isNaN(page)) {
        setActivePdfPage(page);
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

  return (
    <div className="flex h-full text-white bg-gray-900 p-4 gap-4">
      <div className="w-1/2 flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 bg-gray-900 flex justify-between items-center">
          <h2 className="text-xl font-bold">{t('chat.title')}</h2>
          <select
            value={selectedDocId || ''}
            onChange={handleDocChange}
            className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500 max-w-[250px]"
          >
            <option value="" disabled>{t('chat.select_doc')}</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.filename}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
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
          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="bg-gray-700 text-gray-400 rounded-lg rounded-bl-none p-3 border border-gray-600 text-sm">
                {t('chat.typing')}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-900">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading || selectedDocId === null}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || selectedDocId === null}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {t('chat.send')}
            </button>
          </form>
        </div>
      </div>

      <div className="w-1/2 h-full">
        {activePdfUrl ? (
          <PDFViewer url={activePdfUrl} pageNumber={activePdfPage} />
        ) : (
          <div className="h-full flex items-center justify-center bg-gray-800 rounded-lg border border-gray-700 text-gray-500">
            {t('pdf.no_selection')}
          </div>
        )}
      </div>
    </div>
  );
};

export default RAGChat;

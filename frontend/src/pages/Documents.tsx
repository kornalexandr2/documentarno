import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { getErrorMessage } from '../api/client';
import { deleteDocument, getDocuments, retryDocument, uploadDocument } from '../api/documents';
import { DocumentItem } from '../types/documents';

const Documents: React.FC = () => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [priority, setPriority] = useState('NORMAL');
  const [uploading, setUploading] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  
  const pollTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchDocs = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getDocuments();
      setDocuments(data);
      setError(null);
      
      // Auto-polling logic: if any doc is processing or pending, refresh soon
      const hasActive = data.some(d => d.status === 'PROCESSING' || d.status === 'PENDING');
      if (hasActive) {
        if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = window.setTimeout(() => void fetchDocs(true), 3000);
      }
    } catch (err: unknown) {
      if (!silent) setError(getErrorMessage(err, t('documents.load_error')));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocs();
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setError(null);
    try {
      await uploadDocument(uploadFile, priority);
      setUploadFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await fetchDocs();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('common.error')));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('documents.confirm_delete'))) return;
    try {
      await deleteDocument(id);
      await fetchDocs();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('documents.delete_error')));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50';
      case 'PROCESSING': return 'bg-blue-500/20 text-blue-500 border-blue-500/50 animate-pulse';
      case 'COMPLETED': return 'bg-green-500/20 text-green-500 border-green-500/50';
      case 'ERROR': return 'bg-red-500/20 text-red-500 border-red-500/50';
      default: return 'bg-gray-500/20 text-gray-500 border-gray-500/50';
    }
  };

  const getPriorityColor = (prio: string) => {
    switch (prio) {
      case 'HIGH': return 'text-red-400';
      case 'NORMAL': return 'text-blue-400';
      case 'LOW': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const handleRetry = async (id: number) => {
    setRetryingId(id);
    setError(null);
    try {
      await retryDocument(id);
      await fetchDocs();
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('documents.retry_error')));
    } finally {
      setRetryingId(null);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return t('documents.not_processed');
    return new Date(value).toLocaleString();
  };

  const formatDocumentMessage = (message: string) => {
    if (message.includes('unexpected page structure') || message.includes('string indices must be integers')) {
      return t('documents.error_unexpected_pdf_structure');
    }
    if (message.includes('No text could be extracted')) {
      return t('documents.error_no_text');
    }
    if (message.includes('source file is missing')) {
      return t('documents.error_missing_file');
    }
    return message;
  };

  const activeProgressDoc = documents.find((doc) => doc.status === 'PROCESSING' && doc.overall_percent != null);

  return (
    <div className="p-6 text-white h-full flex flex-col">
      <h1 className="text-3xl font-bold mb-6">{t('documents.title')}</h1>

      {error && (
        <div className="mb-4 p-4 text-red-300 bg-red-900/40 border border-red-800 rounded">
          {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <h2 className="text-xl mb-4 font-semibold">{t('documents.upload_new')}</h2>
        <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm mb-2">{t('documents.file')}</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              disabled={uploading}
            />
          </div>
          <div className="w-full md:w-48">
            <label className="block text-sm mb-2">{t('documents.priority')}</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
              disabled={uploading}
            >
              <option value="HIGH">{t('documents.prio_high')}</option>
              <option value="NORMAL">{t('documents.prio_normal')}</option>
              <option value="LOW">{t('documents.prio_low')}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={uploading || !uploadFile}
            className="w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold disabled:opacity-50"
          >
            {uploading ? t('common.loading') : t('documents.btn_upload')}
          </button>
        </form>
      </div>

      {activeProgressDoc && (
        <div className="bg-gray-800 rounded-lg p-6 border border-blue-700/40 mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-sm uppercase tracking-wide text-blue-400 font-bold">
                {t('documents.status_processing')}
              </div>
              <div className="text-lg text-white font-semibold mt-1">{activeProgressDoc.filename}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>{t('documents.overall_progress', { completed: activeProgressDoc.completed_docs ?? 0, total: activeProgressDoc.total_docs ?? 0 })}</span>
                  <span>{`${(activeProgressDoc.overall_percent ?? 0).toFixed(1)}%`}</span>
                </div>
                <div className="w-full h-2.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${activeProgressDoc.overall_percent ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>{t('documents.pages_progress', { current: activeProgressDoc.current_page ?? 0, total: activeProgressDoc.total_pages ?? 0 })}</span>
                  <span>{`${(activeProgressDoc.current_document_percent ?? 0).toFixed(1)}%`}</span>
                </div>
                <div className="w-full h-2.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${activeProgressDoc.current_document_percent ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-xl font-semibold">{t('documents.list_title')}</h2>
          <button onClick={() => void fetchDocs()} className="text-sm text-blue-400 hover:text-blue-300">
            {t('common.refresh')}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center py-10">{t('common.loading')}</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 text-gray-400">{t('documents.no_documents')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-sm">
                    <th className="py-3 px-4 font-medium">ID</th>
                    <th className="py-3 px-4 font-medium">{t('documents.filename')}</th>
                    <th className="py-3 px-4 font-medium">{t('documents.status')}</th>
                    <th className="py-3 px-4 font-medium">{t('documents.priority')}</th>
                    <th className="py-3 px-4 font-medium">{t('documents.added_at')}</th>
                    <th className="py-3 px-4 font-medium">{t('documents.processed_at')}</th>
                    <th className="py-3 px-4 font-medium text-right">{t('documents.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <React.Fragment key={doc.id}>
                    <tr className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4 text-gray-400">#{doc.id}</td>
                      <td className="py-3 px-4 font-medium">{doc.filename}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border w-fit ${getStatusColor(doc.status)}`}>
                            {t('documents.status_' + doc.status.toLowerCase(), doc.status)}
                          </span>
                          {doc.status === 'PROCESSING' && doc.current_document_percent != null && (
                            <div className="mt-2 w-[220px] max-w-full">
                              <div className="flex justify-between text-[10px] text-blue-300 mb-1">
                                <span>{t('documents.queue_progress', { completed: doc.completed_docs ?? 0, total: doc.total_docs ?? 0 })}</span>
                                <span>{`${(doc.overall_percent ?? 0).toFixed(1)}%`}</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-500"
                                  style={{ width: `${doc.overall_percent ?? 0}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-blue-300 mt-1 mb-1">
                                <span>{t('documents.pages_progress', { current: doc.current_page ?? 0, total: doc.total_pages ?? 0 })}</span>
                                <span>{`${(doc.current_document_percent ?? 0).toFixed(1)}%`}</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 transition-all duration-500"
                                  style={{ width: `${doc.current_document_percent ?? 0}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {doc.status === 'ERROR' && doc.error_message && (
                            <span className="text-[10px] text-red-400 mt-1 max-w-[250px] break-words" title={doc.error_message}>
                              {formatDocumentMessage(doc.error_message)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`py-3 px-4 font-semibold text-sm ${getPriorityColor(doc.priority)}`}>
                        {t('documents.prio_' + doc.priority.toLowerCase(), doc.priority)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {formatDate(doc.processed_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedHistoryId(expandedHistoryId === doc.id ? null : doc.id)}
                            className="text-blue-400 hover:text-blue-300 text-sm font-medium px-3 py-1 rounded hover:bg-blue-400/10 transition-colors"
                          >
                            {t('documents.history')}
                          </button>
                          {doc.status === 'ERROR' && (
                            <button
                              type="button"
                              onClick={() => void handleRetry(doc.id)}
                              disabled={retryingId === doc.id}
                              className="text-emerald-400 hover:text-emerald-300 text-sm font-medium px-3 py-1 rounded hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                            >
                              {retryingId === doc.id ? t('common.loading') : t('documents.retry')}
                            </button>
                          )}
                          <button
                            onClick={() => void handleDelete(doc.id)}
                            className="text-red-400 hover:text-red-300 text-sm font-medium px-3 py-1 rounded hover:bg-red-400/10 transition-colors"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedHistoryId === doc.id && (
                      <tr className="border-b border-gray-700/50 bg-gray-900/60">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-2">
                            {(doc.events || []).length === 0 ? (
                              <div className="text-sm text-gray-400">{t('documents.no_history')}</div>
                            ) : (
                              (doc.events || []).map((event) => (
                                <div key={event.id} className="flex flex-col md:flex-row md:items-start gap-1 md:gap-4 text-sm">
                                  <span className="text-gray-500 md:w-44 flex-shrink-0">{formatDate(event.created_at)}</span>
                                  <span className="text-blue-300 md:w-40 flex-shrink-0">
                                    {t(`documents.event_${event.event_type}`, event.event_type)}
                                  </span>
                                  <span className="text-gray-300">{formatDocumentMessage(event.message)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Documents;

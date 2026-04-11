import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getErrorMessage } from '../api/client';
import { deleteDocument, getDocuments, uploadDocument } from '../api/documents';
import { DocumentItem } from '../types/documents';

const Documents: React.FC = () => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [priority, setPriority] = useState('NORMAL');
  const [uploading, setUploading] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const data = await getDocuments();
      setDocuments(data);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load documents'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocs();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setError(null);
    try {
      await uploadDocument(uploadFile, priority);
      setUploadFile(null);
      await fetchDocs();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to upload document'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('documents.confirm_delete', 'Are you sure you want to delete this document?'))) return;

    try {
      await deleteDocument(id);
      await fetchDocs();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete document'));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50';
      case 'PROCESSING': return 'bg-blue-500/20 text-blue-500 border-blue-500/50';
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

  return (
    <div className="p-6 text-white h-full flex flex-col">
      <h1 className="text-3xl font-bold mb-6">{t('documents.title', 'Document Management')}</h1>

      {error && (
        <div className="mb-4 p-4 text-red-300 bg-red-900/40 border border-red-800 rounded">
          {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <h2 className="text-xl mb-4 font-semibold">{t('documents.upload_new', 'Upload New Document')}</h2>
        <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm mb-2">{t('documents.file', 'PDF or DOCX File')}</label>
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              disabled={uploading}
            />
          </div>
          <div className="w-full md:w-48">
            <label className="block text-sm mb-2">{t('documents.priority', 'Priority')}</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
              disabled={uploading}
            >
              <option value="HIGH">{t('documents.prio_high', 'HIGH')}</option>
              <option value="NORMAL">{t('documents.prio_normal', 'NORMAL')}</option>
              <option value="LOW">{t('documents.prio_low', 'LOW')}</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={uploading || !uploadFile}
            className="w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold disabled:opacity-50"
          >
            {uploading ? t('common.loading') : t('documents.btn_upload', 'Upload')}
          </button>
        </form>
      </div>

      <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
          <h2 className="text-xl font-semibold">{t('documents.list_title', 'Uploaded Documents')}</h2>
          <button onClick={() => void fetchDocs()} className="text-sm text-blue-400 hover:text-blue-300">
            {t('common.refresh', 'Refresh')}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center py-10">{t('common.loading')}</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 text-gray-400">{t('documents.no_documents', 'No documents uploaded yet.')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-sm">
                    <th className="py-3 px-4 font-medium">ID</th>
                    <th className="py-3 px-4 font-medium">{t('documents.filename', 'Filename')}</th>
                    <th className="py-3 px-4 font-medium">{t('documents.status', 'Status')}</th>
                    <th className="py-3 px-4 font-medium">{t('documents.priority', 'Priority')}</th>
                    <th className="py-3 px-4 font-medium">{t('documents.date', 'Date')}</th>
                    <th className="py-3 px-4 font-medium text-right">{t('documents.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                      <td className="py-3 px-4 text-gray-400">#{doc.id}</td>
                      <td className="py-3 px-4 font-medium">{doc.source_path}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(doc.status)}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-semibold text-sm ${getPriorityColor(doc.priority)}`}>
                        {doc.priority}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {new Date(doc.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => void handleDelete(doc.id)}
                          className="text-red-400 hover:text-red-300 text-sm font-medium px-3 py-1 rounded hover:bg-red-400/10 transition-colors"
                        >
                          {t('common.delete', 'Delete')}
                        </button>
                      </td>
                    </tr>
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

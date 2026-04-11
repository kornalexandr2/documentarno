import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { API_URL, getErrorMessage } from '../api/client';
import { getModels, pullModel } from '../api/models';
import { OllamaModel } from '../types/models';

const ModelHub: React.FC = () => {
  const { t } = useTranslation();
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'online' | 'offline'>('list');

  const [pullModelName, setPullModelName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<number | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadModelName, setUploadModelName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await getModels();
      setModels(res.models || []);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load models'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'list') {
      void fetchModels();
    }
  }, [activeTab]);

  const handlePull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pullModelName) return;

    setPulling(true);
    setError(null);
    setPullProgress(0);

    let progressInterval: ReturnType<typeof setInterval> | undefined;
    try {
      progressInterval = setInterval(() => {
        setPullProgress((prev) => {
          if (prev === null || prev >= 95) {
            if (progressInterval) {
              clearInterval(progressInterval);
            }
            return prev;
          }
          return prev + 5;
        });
      }, 500);

      await pullModel(pullModelName);
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setPullProgress(100);
      setPullModelName('');
      setTimeout(() => {
        setPullProgress(null);
        setActiveTab('list');
      }, 1000);
    } catch (err: unknown) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setPullProgress(null);
      setError(getErrorMessage(err, 'Failed to pull model'));
    } finally {
      setPulling(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadModelName) return;

    setUploading(true);
    setError(null);
    setUploadProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('model_name', uploadModelName);

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }

          let message = xhr.statusText || 'Upload failed';
          try {
            const response = JSON.parse(xhr.responseText) as { detail?: string };
            message = response.detail || message;
          } catch {
            // Keep fallback message.
          }
          reject(new Error(message));
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', `${API_URL}/models/upload`);
        const token = localStorage.getItem('token');
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        xhr.send(formData);
      });

      setUploadProgress(100);
      setUploadFile(null);
      setUploadModelName('');
      setTimeout(() => {
        setUploadProgress(null);
        setActiveTab('list');
      }, 1000);
    } catch (err: unknown) {
      setUploadProgress(null);
      setError(getErrorMessage(err, 'Failed to upload model'));
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;

  return (
    <div className="p-6 text-white">
      <h1 className="text-3xl font-bold mb-6">{t('models.title')}</h1>

      {error && (
        <div className="mb-4 p-4 text-red-300 bg-red-900/40 border border-red-800 rounded">
          {error}
        </div>
      )}

      <div className="flex space-x-4 mb-6 border-b border-gray-700 pb-2">
        <button
          className={`px-4 py-2 font-medium rounded-t ${activeTab === 'list' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
          onClick={() => setActiveTab('list')}
        >
          {t('models.installed')}
        </button>
        <button
          className={`px-4 py-2 font-medium rounded-t ${activeTab === 'online' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
          onClick={() => setActiveTab('online')}
        >
          {t('models.pull_online')}
        </button>
        <button
          className={`px-4 py-2 font-medium rounded-t ${activeTab === 'offline' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}
          onClick={() => setActiveTab('offline')}
        >
          {t('models.upload_offline')}
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 min-h-[400px]">
        {activeTab === 'list' && (
          <div>
            {loading ? (
              <div className="text-center py-10">{t('common.loading')}</div>
            ) : models.length === 0 ? (
              <div className="text-center py-10 text-gray-400">{t('models.no_models')}</div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {models.map((m) => (
                  <div key={m.digest} className="bg-gray-900 p-4 rounded border border-gray-700">
                    <h3 className="font-bold text-lg text-blue-400">{m.name}</h3>
                    <p className="text-sm text-gray-400 mt-2">Size: {formatSize(m.size)}</p>
                    <p className="text-sm text-gray-400">Format: {m.details?.format}</p>
                    <p className="text-sm text-gray-400">Parameter Size: {m.details?.parameter_size}</p>
                    <p className="text-xs text-gray-500 mt-4 truncate">Digest: {m.digest}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'online' && (
          <div className="max-w-xl mx-auto py-8">
            <h2 className="text-xl mb-4 font-semibold">{t('models.pull_description')}</h2>
            <form onSubmit={handlePull} className="space-y-4">
              <div>
                <label className="block text-sm mb-2">{t('models.model_tag')}</label>
                <input
                  type="text"
                  value={pullModelName}
                  onChange={(e) => setPullModelName(e.target.value)}
                  placeholder="e.g. llama3:8b"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
                  disabled={pulling}
                />
              </div>
              {pullProgress !== null && (
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${pullProgress}%` }}
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={pulling || !pullModelName}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold disabled:opacity-50"
              >
                {pulling ? t('common.loading') : t('models.btn_pull')}
              </button>
            </form>

            <div className="mt-10 p-5 bg-blue-900/20 border border-blue-800/50 rounded-lg text-sm space-y-4">
              <h3 className="text-lg font-bold text-blue-400 border-b border-blue-800/50 pb-1 flex items-center">
                <span className="mr-2">💡</span> {t('models.recommendations.title')}
              </h3>
              
              <div>
                <h4 className="font-semibold text-blue-300 mb-1">{t('models.recommendations.tags_title')}</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                  <li>{t('models.recommendations.tag_latest')}</li>
                  <li>{t('models.recommendations.tag_tools')}</li>
                  <li>{t('models.recommendations.tag_thinking')}</li>
                  <li>{t('models.recommendations.tag_text')}</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-blue-300 mb-1">{t('models.recommendations.sizes_title')}</h4>
                <ul className="list-disc list-inside text-gray-300 space-y-1 ml-2">
                  <li>{t('models.recommendations.size_small')}</li>
                  <li>{t('models.recommendations.size_medium')}</li>
                  <li>{t('models.recommendations.size_large')}</li>
                  <li>{t('models.recommendations.size_xl')}</li>
                </ul>
              </div>

              <div className="pt-2 text-center">
                <a 
                  href="https://ollama.com/library" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline font-medium"
                >
                  {t('models.recommendations.link_text')}
                </a>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'offline' && (
          <div className="max-w-xl mx-auto py-8">
            <h2 className="text-xl mb-4 font-semibold">{t('models.upload_description')}</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm mb-2">{t('models.custom_name')}</label>
                <input
                  type="text"
                  value={uploadModelName}
                  onChange={(e) => setUploadModelName(e.target.value)}
                  placeholder="e.g. my-local-llama3:8b"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-sm mb-2">{t('models.gguf_file')}</label>
                <input
                  type="file"
                  accept=".gguf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  disabled={uploading}
                />
              </div>
              {uploadProgress !== null && (
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full bg-green-600 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={uploading || !uploadModelName || !uploadFile}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold disabled:opacity-50"
              >
                {uploading ? t('common.loading') : t('models.btn_upload')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelHub;

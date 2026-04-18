import React, { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { notifyAuthExpired } from '../api/client';
import { useAuth } from '../context/auth-context';
import { getWebSocketUrl } from '../api/system';

interface LiveMetrics {
  app_state: string;
  ocr_progress?: {
    doc_id: number;
    filename: string;
    current_page: number;
    total_pages: number;
    current_document_percent: number;
    current_document_index: number;
    completed_docs: number;
    total_docs: number;
    remaining_docs: number;
    overall_percent: number;
  } | null;
}

const DashboardLayout: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const wsUrl = getWebSocketUrl();
    if (!wsUrl) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      socket = new WebSocket(wsUrl);
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as LiveMetrics;
          setMetrics(data);
        } catch (err) {
          console.error('Failed to parse websocket metrics', err);
        }
      };

      socket.onclose = (event) => {
        if (event.code === 1008) {
          notifyAuthExpired();
          return;
        }
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (socket) socket.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const appState = metrics?.app_state || 'SEARCH';
  const ocr = metrics?.ocr_progress;
  const currentDocPercent = ocr?.current_document_percent ?? 0;
  const overallPercent = ocr?.overall_percent ?? 0;

  return (
    <div className="min-h-screen bg-gray-900 w-full flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 h-16 flex items-center justify-between px-6 z-20">
        <div className="flex items-center space-x-4">
          <div className="text-xl font-bold text-white tracking-widest">{t('layout.app_name')}</div>
          <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            appState === 'LOCKDOWN' ? 'bg-red-600 text-white' : 
            appState === 'PROCESSING' ? 'bg-blue-600 text-white animate-pulse' : 
            'bg-green-600/20 text-green-400 border border-green-500/30'
          }`}>
            {t(`system_state.state_${appState.toLowerCase()}`, appState)}
          </div>
        </div>
        
        <div className="flex items-center space-x-6">
          {ocr && (
            <div className="hidden md:flex items-center gap-4 bg-gray-900/80 px-4 py-2 rounded-xl border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              <div className="flex flex-col min-w-[190px]">
                <div className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
                  {t('documents.status_processing')}
                </div>
                <div className="text-[11px] text-gray-300 max-w-[220px] truncate">
                  {ocr.filename}
                </div>
              </div>
              <div className="flex flex-col gap-1 border-l border-gray-700 pl-4 min-w-[220px]">
                <div className="flex items-center justify-between text-[10px] text-gray-300">
                  <span>{`Очередь: ${ocr.completed_docs}/${ocr.total_docs}`}</span>
                  <span>{`${overallPercent.toFixed(1)}%`}</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-300">
                  <span>{`Документ: ${ocr.current_document_index}/${ocr.total_docs}`}</span>
                  <span>{`${ocr.current_page}/${ocr.total_pages} стр.`}</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500 ease-out"
                    style={{ width: `${currentDocPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            {t('common.logout')}
          </button>
        </div>
      </header>

      {ocr && (
        <div className="md:hidden w-full bg-gray-800 border-b border-gray-700 px-4 py-2 space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase text-blue-400 font-bold">
            <span>{t('documents.status_processing')}</span>
            <span>{`Очередь ${ocr.completed_docs}/${ocr.total_docs}`}</span>
          </div>
          <div className="text-[11px] text-gray-300 truncate">{ocr.filename}</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-300">
              <span>{`Всего: ${overallPercent.toFixed(1)}%`}</span>
              <span>{`Осталось файлов: ${ocr.remaining_docs}`}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-300">
              <span>{`Текущий документ: ${currentDocPercent.toFixed(1)}%`}</span>
              <span>{`${ocr.current_page}/${ocr.total_pages} стр.`}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${currentDocPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-gray-800 border-r border-gray-700 flex-shrink-0">
          <nav className="flex flex-col gap-2 p-4">
            <Link to="/" className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{t('layout.nav_dashboard')}</Link>
            <Link to="/chat" className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/chat') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{t('layout.nav_chat')}</Link>
            <Link to="/documents" className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/documents') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{t('layout.nav_documents')}</Link>
            <Link to="/models" className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/models') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{t('layout.nav_models')}</Link>
            <Link to="/hardware" className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/hardware') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{t('layout.nav_hardware')}</Link>
            <Link to="/settings" className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/settings') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{t('layout.nav_settings')}</Link>
          </nav>
        </aside>

        <main className="flex-1 overflow-auto bg-gray-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;

import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/auth-context';

const DashboardLayout: React.FC = () => {
  const { t } = useTranslation();
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen bg-gray-900 w-full flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 h-16 flex items-center justify-between px-6 z-10">
        <div className="text-xl font-bold text-white tracking-widest">{t('layout.app_name')}</div>
        <button
          onClick={logout}
          className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
        >
          {t('common.logout')}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-gray-800 border-r border-gray-700 flex-shrink-0">
          <nav className="flex flex-col gap-2 p-4">
            <Link
              to="/"
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname === '/' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {t('layout.nav_dashboard')}
            </Link>
            <Link
              to="/chat"
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/chat') ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {t('layout.nav_chat')}
            </Link>
            <Link
              to="/documents"
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/documents') ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {t('layout.nav_documents')}
            </Link>
            <Link
              to="/models"
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/models') ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {t('layout.nav_models')}
            </Link>
            <Link
              to="/hardware"
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/hardware') ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {t('layout.nav_hardware')}
            </Link>
            <Link
              to="/settings"
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${location.pathname.startsWith('/settings') ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
            >
              {t('layout.nav_settings')}
            </Link>
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

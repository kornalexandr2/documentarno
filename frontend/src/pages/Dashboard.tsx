import React from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/auth-context';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { logout } = useAuth();

  return (
    <div className="p-8 text-white">
      <h1 className="text-3xl font-bold mb-4">{t('dashboard.title')}</h1>
      <p className="mb-8">{t('dashboard.welcome')}</p>

      <button
        onClick={logout}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white font-bold transition-colors"
      >
        {t('common.logout')}
      </button>
    </div>
  );
};

export default Dashboard;

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { triggerLockdown, triggerUnlock, kickAllUsers, getSystemState, setSystemState, getSystemLogs } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { resetStuckDocuments } from '../api/documents';
import { getModels } from '../api/models';
import { AppSettings, getAppSettings, updateAppSettings } from '../api/settings';
import { OllamaModel } from '../types/models';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>({
    system_prompt: '',
    sync_mode: 'SYNC_AUTO',
    default_model: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
  });
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [appState, setAppState] = useState<string>('SEARCH');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<string>('');
  const [logLines, setLogLines] = useState(100);
  const [logContainer, setLogContainer] = useState('doc_backend');
  const [logViewMode, setLogViewMode] = useState<'pretty' | 'raw'>('pretty');
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchSettingsData = async () => {
    try {
      const [settingsData, stateData, modelsData] = await Promise.all([
        getAppSettings(),
        getSystemState(),
        getModels()
      ]);
      
      setSettings({
        system_prompt: settingsData.system_prompt || '',
        sync_mode: settingsData.sync_mode || 'SYNC_AUTO',
        default_model: settingsData.default_model || '',
        telegram_bot_token: settingsData.telegram_bot_token || '',
        telegram_chat_id: settingsData.telegram_chat_id || '',
      });
      setAppState(stateData.state);
      setAvailableModels(modelsData.models || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('settings_actions.load_error', 'Failed to load settings')));
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await getSystemLogs(logLines, logContainer);
      setLogs(data.logs);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchSettingsData().finally(() => setLoading(false));
    void fetchLogs();
  }, [t]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const data = await updateAppSettings(settings);
      setSettings(data);
      setSuccessMsg(t('settings.prompt_saved', 'System settings saved successfully.'));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('settings_actions.save_error', 'Failed to save settings')));
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'lockdown' | 'unlock' | 'kick' | 'SEARCH' | 'PROCESSING' | 'RESET_TASKS') => {
    try {
      setLoading(true);
      setError(null);
      
      if (action === 'lockdown') {
        await triggerLockdown();
      } else if (action === 'unlock') {
        await triggerUnlock();
      } else if (action === 'kick') {
        await kickAllUsers();
      } else if (action === 'SEARCH' || action === 'PROCESSING') {
        await setSystemState(action);
      } else if (action === 'RESET_TASKS') {
        const res = await resetStuckDocuments();
        setSuccessMsg(`${t('system_state.btn_reset_tasks')}: ${res.reset_count}`);
      }
      
      if (action !== 'RESET_TASKS') {
        const stateData = await getSystemState();
        setAppState(stateData.state);
        setSuccessMsg(t('settings_actions.action_success', { action }));
      }
      
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('settings_actions.action_error', { action })));
    } finally {
      setLoading(false);
    }
  };

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'SEARCH': return t('system_state.state_search');
      case 'PROCESSING': return t('system_state.state_processing');
      case 'LOCKDOWN': return t('system_state.state_lockdown');
      default: return state;
    }
  };

  return (
    <div className="p-6 text-white h-full flex flex-col max-w-5xl mx-auto overflow-y-auto">
      <h1 className="text-3xl font-bold mb-6">{t('settings.title', 'System Settings')}</h1>

      {error && (
        <div className="mb-4 p-4 text-red-300 bg-red-900/40 border border-red-800 rounded">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-4 text-green-300 bg-green-900/40 border border-green-800 rounded">
          {successMsg}
        </div>
      )}

      {/* System Mode Section */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
        <h2 className="text-xl mb-2 font-semibold">{t('system_state.title')}</h2>
        <p className="text-sm text-gray-400 mb-4">{t('system_state.description')}</p>
        
        <div className="flex items-center space-x-4 mb-6 p-3 bg-gray-900 rounded border border-gray-700">
          <span className="text-gray-400">{t('system_state.current')}</span>
          <span className={`font-bold px-3 py-1 rounded ${appState === 'LOCKDOWN' ? 'bg-red-600' : appState === 'PROCESSING' ? 'bg-blue-600' : 'bg-green-600'}`}>
            {getStateLabel(appState)}
          </span>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => void handleAction('SEARCH')}
            disabled={loading || appState === 'SEARCH'}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold disabled:opacity-50"
          >
            {t('system_state.btn_change', { state: t('system_state.search') })}
          </button>
          <button
            onClick={() => void handleAction('PROCESSING')}
            disabled={loading || appState === 'PROCESSING'}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold disabled:opacity-50"
          >
            {t('system_state.btn_change', { state: t('system_state.processing') })}
          </button>
          <button
            onClick={() => void handleAction('lockdown')}
            disabled={loading || appState === 'LOCKDOWN'}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-bold disabled:opacity-50"
          >
            {t('settings_actions.lockdown')}
          </button>
          <button
            onClick={() => void handleAction('RESET_TASKS')}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded font-bold disabled:opacity-50"
          >
            {t('system_state.btn_reset_tasks')}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6 mb-10">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl mb-2 font-semibold">{t('settings.prompt_title')}</h2>
          <textarea
            name="system_prompt"
            value={settings.system_prompt}
            onChange={handleChange}
            rows={6}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-white font-mono text-sm"
            disabled={loading}
          />
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl mb-4 font-semibold">{t('settings.default_model')}</h2>
          <select
            name="default_model"
            value={settings.default_model || ''}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
            disabled={loading}
          >
            <option value="">-- {t('chat.select_model')} --</option>
            {availableModels.map((m) => (
              <option key={m.name} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl mb-4 font-semibold">{t('settings_actions.telegram_title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              name="telegram_bot_token"
              value={settings.telegram_bot_token || ''}
              onChange={handleChange}
              placeholder={t('settings_actions.bot_token')}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded text-white"
            />
            <input
              type="text"
              name="telegram_chat_id"
              value={settings.telegram_chat_id || ''}
              onChange={handleChange}
              placeholder={t('settings_actions.chat_id')}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded text-white"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>

      {/* Logs Section */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden mb-10">
        <div className="p-4 border-b border-gray-700 bg-gray-800/50 flex flex-wrap justify-between items-center gap-4">
          <h2 className="text-xl font-semibold">{t('system_state.logs_title')}</h2>
          
          <div className="flex items-center gap-3">
            <select 
              value={logContainer} 
              onChange={(e) => setLogContainer(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs"
            >
              <option value="doc_backend">Backend</option>
              <option value="doc_celery_worker">Worker (OCR)</option>
              <option value="doc_ollama">Ollama (LLM)</option>
              <option value="doc_nginx">Nginx (Gateway)</option>
            </select>
            
            <input 
              type="number" 
              value={logLines} 
              onChange={(e) => setLogLines(Number(e.target.value))}
              className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs"
            />

            <div className="flex bg-gray-900 rounded border border-gray-600 p-0.5">
              <button 
                onClick={() => setLogViewMode('pretty')}
                className={`px-2 py-1 text-[10px] rounded ${logViewMode === 'pretty' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
              >
                {t('system_state.logs_view_pretty')}
              </button>
              <button 
                onClick={() => setLogViewMode('raw')}
                className={`px-2 py-1 text-[10px] rounded ${logViewMode === 'raw' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
              >
                {t('system_state.logs_view_raw')}
              </button>
            </div>

            <button 
              onClick={() => void fetchLogs()} 
              disabled={loadingLogs}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {t('common.refresh')}
            </button>
          </div>
        </div>

        <div className="p-4 h-[500px] overflow-auto bg-black/50 font-mono text-xs leading-relaxed">
          {loadingLogs ? (
            <div className="text-center py-20">{t('common.loading')}</div>
          ) : !logs ? (
            <div className="text-center py-20 text-gray-500">{t('system_state.logs_empty')}</div>
          ) : logViewMode === 'raw' ? (
            <pre className="whitespace-pre-wrap text-gray-300">{logs}</pre>
          ) : (
            <div className="space-y-0.5">
              {logs.split('\n').filter(l => l.trim()).map((line, i) => {
                const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('fail');
                const isWarn = line.toLowerCase().includes('warn');
                const isSuccess = line.toLowerCase().includes('success') || line.toLowerCase().includes('completed');
                const colorClass = isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : isSuccess ? 'text-green-400' : 'text-gray-300';
                return (
                  <div key={i} className={`pb-0.5 border-b border-gray-800/20 ${colorClass}`}>
                    <span className="opacity-50 mr-2">[{i+1}]</span>
                    {line}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;

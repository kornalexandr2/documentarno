import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { triggerLockdown, triggerUnlock, kickAllUsers, getSystemState, setSystemState } from '../api/admin';
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

  useEffect(() => {
    setLoading(true);
    
    const fetchData = async () => {
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
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
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
        // Refresh state
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
    <div className="p-6 text-white h-full flex flex-col max-w-4xl mx-auto overflow-y-auto">
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
          {appState === 'LOCKDOWN' && (
            <button
              onClick={() => void handleAction('unlock')}
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold"
            >
              {t('settings_actions.unlock')}
            </button>
          )}
          <button
            onClick={() => void handleAction('kick')}
            disabled={loading}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-bold disabled:opacity-50"
          >
            {t('settings_actions.kick')}
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

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl mb-2 font-semibold">{t('settings.prompt_title', 'System Prompt Configuration')}</h2>
          <p className="text-sm text-gray-400 mb-6">
            {t('settings.prompt_description', 'Configure the initial behavior of the LLM. You should provide instructions on how the assistant should format the output and handle context.')}
          </p>

          <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded mb-6 text-sm text-blue-200">
            <strong>{t('settings.hint', 'Hint:')}</strong> {t('settings.prompt_hint_text', 'For optimal RAG performance, instruct the model to strictly use the provided context, inform the user if the answer is missing in the text, and use Markdown formatting for references (e.g., table structure, bold text).')}
          </div>

          <textarea
            name="system_prompt"
            value={settings.system_prompt}
            onChange={handleChange}
            rows={8}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-white font-mono text-sm leading-relaxed"
            placeholder="Ты — полезный AI-ассистент..."
            disabled={loading}
          />
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl mb-4 font-semibold">{t('settings.default_model', 'Default Model')}</h2>
          <p className="text-sm text-gray-400 mb-4">
            {t('settings.default_model_description', 'Used for chat requests when the client does not specify a model explicitly.')}
          </p>
          <select
            name="default_model"
            value={settings.default_model || ''}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
            disabled={loading}
          >
            <option value="">-- {t('chat.select_model', 'Select model')} --</option>
            {availableModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({Math.round(m.size / 1024 / 1024 / 1024 * 100) / 100} GB)
              </option>
            ))}
          </select>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl mb-4 font-semibold">{t('settings_actions.watchdog_title', 'Watchdog & Sync Mode')}</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Sync Mode</label>
            <select
              name="sync_mode"
              value={settings.sync_mode}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
              disabled={loading}
            >
              <option value="SYNC_AUTO">{t('settings_actions.sync_auto')}</option>
              <option value="SYNC_ADD_ONLY">{t('settings_actions.sync_add_only')}</option>
              <option value="SYNC_PROMPT">{t('settings_actions.sync_prompt')}</option>
            </select>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl mb-4 font-semibold">{t('settings_actions.telegram_title', 'Telegram Notifications')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{t('settings_actions.bot_token', 'Bot Token')}</label>
              <input
                type="text"
                name="telegram_bot_token"
                value={settings.telegram_bot_token || ''}
                onChange={handleChange}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">{t('settings_actions.chat_id', 'Chat ID')}</label>
              <input
                type="text"
                name="telegram_chat_id"
                value={settings.telegram_chat_id || ''}
                onChange={handleChange}
                placeholder="-1001234567890"
                className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pb-10">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-bold disabled:opacity-50 transition-colors shadow-lg"
          >
            {loading ? t('common.loading') : t('common.save', 'Save Changes')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;

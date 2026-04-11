import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { triggerLockdown, triggerUnlock, kickAllUsers } from '../api/admin';
import { getErrorMessage } from '../api/client';
import { AppSettings, getAppSettings, updateAppSettings } from '../api/settings';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>({
    system_prompt: '',
    sync_mode: 'SYNC_AUTO',
    default_model: 'llama3.1:8b',
    telegram_bot_token: '',
    telegram_chat_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getAppSettings()
      .then((data) => {
        setSettings({
          system_prompt: data.system_prompt || '',
          sync_mode: data.sync_mode || 'SYNC_AUTO',
          default_model: data.default_model || 'llama3.1:8b',
          telegram_bot_token: data.telegram_bot_token || '',
          telegram_chat_id: data.telegram_chat_id || '',
        });
      })
      .catch((err: unknown) => setError(getErrorMessage(err, t('settings_actions.load_error', 'Failed to load settings'))))
      .finally(() => setLoading(false));
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

  const handleAction = async (action: 'lockdown' | 'unlock' | 'kick') => {
    try {
      setLoading(true);
      setError(null);
      if (action === 'lockdown') await triggerLockdown();
      if (action === 'unlock') await triggerUnlock();
      if (action === 'kick') await kickAllUsers();
      setSuccessMsg(t('settings_actions.action_success', { action }));
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('settings_actions.action_error', { action })));
    } finally {
      setLoading(false);
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

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6 flex flex-wrap gap-4">
        <button
          onClick={() => void handleAction('lockdown')}
          disabled={loading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-bold disabled:opacity-50"
        >
          {t('settings_actions.lockdown')}
        </button>
        <button
          onClick={() => void handleAction('unlock')}
          disabled={loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold disabled:opacity-50"
        >
          {t('settings_actions.unlock')}
        </button>
        <button
          onClick={() => void handleAction('kick')}
          disabled={loading}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-bold disabled:opacity-50"
        >
          {t('settings_actions.kick')}
        </button>
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
          <input
            type="text"
            name="default_model"
            value={settings.default_model || ''}
            onChange={handleChange}
            placeholder="llama3.1:8b"
            className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 text-white"
            disabled={loading}
          />
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

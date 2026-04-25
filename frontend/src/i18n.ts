import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en.json';
import ruTranslation from './locales/ru.json';

const ruOverrides = {
  chat: {
    history: 'История чатов хранится локально в этом браузере.',
    new_chat: 'Новый чат',
    empty_history: 'Сообщений пока нет',
    generating: 'Генерация...',
    background_notice: 'Другой чат всё ещё генерирует ответ в фоне. Он продолжится, даже если вы перейдёте на другую страницу.',
  },
};

const resources = {
  en: {
    translation: enTranslation,
  },
  ru: {
    translation: {
      ...ruTranslation,
      chat: {
        ...ruTranslation.chat,
        ...ruOverrides.chat,
      },
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ru', // default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en.json';
import ruTranslation from './locales/ru.json';

const resources = {
  en: {
    translation: enTranslation,
  },
  ru: {
    translation: ruTranslation,
  },
};

const supportedLanguages = ['en', 'ru'];
const savedLanguage = window.localStorage.getItem('documentarno.language');
const browserLanguage = window.navigator.language.split('-')[0];
const initialLanguage = supportedLanguages.includes(savedLanguage || '')
  ? savedLanguage
  : supportedLanguages.includes(browserLanguage)
    ? browserLanguage
    : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage || 'en',
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

i18n.on('languageChanged', (lng) => {
  window.localStorage.setItem('documentarno.language', lng);
});

export default i18n;

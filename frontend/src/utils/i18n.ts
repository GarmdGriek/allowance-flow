import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './i18n/en';

export const defaultLanguage = 'en';
const supportedLanguages = ['en', 'nb'] as const;
type SupportedLanguage = typeof supportedLanguages[number];

const detectInitialLanguage = (): SupportedLanguage => {
  if (typeof window === 'undefined') return defaultLanguage;
  try {
    const stored = localStorage.getItem('allowance-flow-language');
    if (stored && supportedLanguages.includes(stored as SupportedLanguage)) {
      return stored as SupportedLanguage;
    }
    const nav = navigator.language?.toLowerCase() ?? '';
    if (nav.startsWith('nb') || nav.startsWith('no') || nav.startsWith('nn')) return 'nb';
  } catch {}
  return defaultLanguage;
};

const initialLng = detectInitialLanguage();

const ensureLanguageLoaded = async (lng: string) => {
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  if (lng === 'nb') {
    const mod = await import('./i18n/nb');
    i18n.addResourceBundle('nb', 'translation', mod.default);
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    fallbackLng: defaultLanguage,
    lng: initialLng,
    supportedLngs: supportedLanguages as unknown as string[],

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'allowance-flow-language',
    },

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  ensureLanguageLoaded(lng).then(() => {
    // Re-emit to trigger re-render in components subscribed via useTranslation.
    // Guarded by hasResourceBundle check above so this doesn't loop.
    i18n.changeLanguage(lng);
  });
});

if (initialLng !== defaultLanguage && !i18n.hasResourceBundle(initialLng, 'translation')) {
  ensureLanguageLoaded(initialLng).then(() => i18n.changeLanguage(initialLng));
}

export default i18n;

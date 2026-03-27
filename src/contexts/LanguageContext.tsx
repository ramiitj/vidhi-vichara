import React, { createContext, useContext, ReactNode } from 'react';

type LanguageContextType = {
  language: string;
  setLanguage: (lang: string) => void;
  t: (text: string) => Promise<string>;
  cache: Record<string, string>;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  return {
    language: 'English',
    setLanguage: () => {},
    t: async (text: string) => text,
    cache: {}
  };
};

export const useTranslatedString = (text: string) => {
  return text;
};

export const TranslatedText = ({ text, className }: { text: string, className?: string }) => {
  return <span className={className}>{text}</span>;
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  return (
    <LanguageContext.Provider value={{ language: 'English', setLanguage: () => {}, t: async (text) => text, cache: {} }}>
      {children}
    </LanguageContext.Provider>
  );
};

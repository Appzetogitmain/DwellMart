import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { isRTL, languageCodeMap, normalizeLanguageCode } from '../utils/languageUtils';

const LanguageContext = createContext(null);

// Languages metadata used for Dropdown / UI
export const availableLanguages = {
    en: { label: 'English', flag: '🇺🇸', code: 'en' },
    es: { label: 'Español', flag: '🇪🇸', code: 'es' },
    fr: { label: 'Français', flag: '🇫🇷', code: 'fr' },
    ar: { label: 'العربية', flag: '🇸🇦', code: 'ar' },
    he: { label: 'עברית', flag: '🇮🇱', code: 'he' },
    ur: { label: 'اردو', flag: '🇵🇰', code: 'ur' },
    hi: { label: 'हिन्दी', flag: '🇮🇳', code: 'hi' },
    zh: { label: '中文', flag: '🇨🇳', code: 'zh-CN' },
    ja: { label: '日本語', flag: '🇯🇵', code: 'ja' },
    ru: { label: 'Русский', flag: '🇷🇺', code: 'ru' },
    de: { label: 'Deutsch', flag: '🇩🇪', code: 'de' },
    pt: { label: 'Português', flag: '🇵🇹', code: 'pt' }
};

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState(() => {
        const stored = localStorage.getItem('dwellmart_language');
        return normalizeLanguageCode(stored || 'en');
    });

    const [isChangingLanguage, setIsChangingLanguage] = useState(false);

    useEffect(() => {
        // Set document direction automatically
        const dir = isRTL(language) ? 'rtl' : 'ltr';
        document.documentElement.dir = dir;
        document.body.dir = dir;
        document.documentElement.lang = language;
        localStorage.setItem('dwellmart_language', language);
    }, [language]);

    const changeLanguage = useCallback(async (code) => {
        setIsChangingLanguage(true);
        const newCode = normalizeLanguageCode(code);
        setLanguage(newCode);
        
        // Simulating the UI state of switching language slightly padded
        setTimeout(() => {
            setIsChangingLanguage(false);
        }, 500);
    }, []);

    const value = useMemo(() => ({
        language,
        languages: availableLanguages,
        changeLanguage,
        isChangingLanguage,
        isRTL: isRTL(language),
    }), [language, isChangingLanguage, changeLanguage]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

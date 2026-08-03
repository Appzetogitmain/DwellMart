import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';

const LanguageSelector = ({ variant = 'desktop' }) => {
    const { language, languages, changeLanguage, isChangingLanguage } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const currentLang = languages[language] || languages['en'];

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (code) => {
        changeLanguage(code);
        setIsOpen(false);
    };

    if (variant === 'mobile') {
        return (
            <div className="flex flex-wrap gap-2 p-4">
                {Object.values(languages).map(lang => (
                    <button
                        key={lang.code}
                        onClick={() => handleSelect(lang.code)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                            language === lang.code 
                            ? 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20' 
                            : 'bg-white/5 text-white/70 hover:bg-white/10'
                        } ${isChangingLanguage ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isChangingLanguage}
                    >
                        <span className="text-base">{lang.flag}</span>
                        <span>{lang.label}</span>
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div className="relative inline-block text-left z-[10005]" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex justify-center w-full rounded-md border border-gray-700 shadow-sm px-3 py-1.5 bg-black text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors focus:outline-none"
                disabled={isChangingLanguage}
            >
                <span className="mr-1">{currentLang.flag}</span>
                <span className="hidden sm:inline-block">{currentLang.label}</span>
                <span className="sm:hidden">{currentLang.code.toUpperCase()}</span>
                {isChangingLanguage && <span className="ml-2 animate-pulse text-xs">•</span>}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="origin-top-right absolute right-0 mt-2 w-40 rounded-md shadow-lg bg-[#0c0c0c] border border-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none max-h-64 overflow-y-auto z-[10006] scrollbar-hide"
                    >
                        <div className="py-1">
                            {Object.values(languages).map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => handleSelect(lang.code)}
                                    className={`w-full text-left flex items-center gap-3 px-4 py-2 text-sm ${
                                        language === lang.code ? 'bg-amber-500/20 text-amber-400 font-bold' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <span>{lang.flag}</span>
                                    <span>{lang.label}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LanguageSelector;

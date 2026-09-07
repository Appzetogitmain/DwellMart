import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown, FiCheck } from 'react-icons/fi';

const LanguageSelector = ({ variant = 'desktop' }) => {
    const { language, languages, changeLanguage, isChangingLanguage } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const currentLang = languages[language] || languages['en'];

    // Close on click outside (handles both mousedown and touchstart for mobile)
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const handleSelect = (code) => {
        changeLanguage(code);
        setIsOpen(false);
    };

    if (variant === 'mobile') {
        return (
            <div className="relative w-full" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 hover:border-amber-500/30 transition-all text-left group"
                    disabled={isChangingLanguage}
                    aria-expanded={isOpen}
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base leading-none shrink-0">{currentLang.flag}</span>
                        <span className="text-sm font-semibold text-white/90 truncate tracking-tight">
                            {currentLang.label}
                        </span>
                        {isChangingLanguage && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                        )}
                    </div>
                    <FiChevronDown
                        className={`text-white/40 text-base transition-transform duration-200 shrink-0 group-hover:text-amber-400 ${
                            isOpen ? "rotate-180 text-amber-400" : ""
                        }`}
                    />
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 right-0 top-full mt-1.5 z-[10020] rounded-xl bg-[#141414] border border-white/15 shadow-2xl overflow-hidden backdrop-blur-xl"
                        >
                            <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5 scrollbar-hide">
                                {Object.values(languages).map((lang) => {
                                    const isSelected = language === lang.code;
                                    return (
                                        <button
                                            key={lang.code}
                                            type="button"
                                            onClick={() => handleSelect(lang.code)}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                                                isSelected
                                                    ? "bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30"
                                                    : "text-white/70 hover:text-white hover:bg-white/5"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 truncate">
                                                <span className="text-base leading-none">{lang.flag}</span>
                                                <span className="truncate">{lang.label}</span>
                                            </div>
                                            {isSelected && <FiCheck className="text-amber-400 text-sm shrink-0 ml-2" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
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

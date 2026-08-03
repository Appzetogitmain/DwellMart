import React, { useState, useRef, useEffect } from 'react';
import useCurrency from '../hooks/useCurrency';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe } from 'lucide-react';

const CurrencySelector = ({ variant = 'desktop' }) => {
    const { selectedCurrency, currencies, setCurrency, currentCurrency, isLoading } = useCurrency();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

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
        setCurrency(code);
        setIsOpen(false);
    };

    if (variant === 'mobile') {
        return (
            <div className="flex flex-wrap gap-2 p-4">
                {currencies.map(curr => (
                    <button
                        key={curr.code}
                        onClick={() => handleSelect(curr.code)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                            selectedCurrency === curr.code 
                            ? 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20' 
                            : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                    >
                        <span className="font-medium">{curr.symbol}</span>
                        <span>{curr.code}</span>
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
                className="inline-flex justify-center items-center gap-2 w-full rounded-md border border-gray-700 shadow-sm px-3 py-1.5 bg-black text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors focus:outline-none"
            >
                <span className="text-amber-400 font-bold">{currentCurrency?.symbol}</span>
                <span className="hidden sm:inline-block">{currentCurrency?.code}</span>
                <Globe size={14} className="opacity-50" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[#0c0c0c] border border-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none max-h-64 overflow-y-auto z-[10006] scrollbar-hide"
                    >
                        <div className="py-1">
                            {currencies.map((curr) => (
                                <button
                                    key={curr.code}
                                    onClick={() => handleSelect(curr.code)}
                                    className={`w-full text-left flex items-center justify-between gap-3 px-4 py-2 text-sm ${
                                        selectedCurrency === curr.code 
                                        ? 'bg-amber-500/20 text-amber-400 font-bold' 
                                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 text-center font-bold text-gray-500">{curr.symbol}</span>
                                        <span>{curr.name}</span>
                                    </div>
                                    <span className="text-xs opacity-50">{curr.code}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CurrencySelector;

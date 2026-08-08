import { useMemo } from 'react';
import useCurrencyStore from '../store/currencyStore';

/**
 * Hook for currency conversion and formatting
 */
const useCurrency = () => {
    const { selectedCurrency, currencies, setCurrency, fetchCurrencies, isLoading } = useCurrencyStore();

    const currentCurrency = useMemo(() => {
        return currencies.find(c => c.code === selectedCurrency) || 
               currencies.find(c => c.code === 'INR') || 
               currencies[0];
    }, [selectedCurrency, currencies]);

    /**
     * Convert an amount from base currency (INR) to selected currency
     */
    const convertPrice = (amount) => {
        if (!amount || isNaN(amount)) return 0;
        return amount * currentCurrency.rate;
    };

    /**
     * Format a price according to selected currency and locale
     */
    const formatPrice = (amount) => {
        const converted = convertPrice(amount);
        return new Intl.NumberFormat(currentCurrency.locale || 'en-IN', {
            style: 'currency',
            currency: currentCurrency.code,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(converted);
    };

    return {
        selectedCurrency,
        currentCurrency,
        currencies,
        setCurrency,
        fetchCurrencies,
        isLoading,
        convertPrice,
        formatPrice
    };
};

export default useCurrency;

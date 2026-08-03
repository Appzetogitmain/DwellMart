import { translationCache } from '../utils/translationCache';
import { getCacheKeyParams, normalizeLanguageCode } from '../utils/languageUtils';

// API endpoint configuration (uses environment variables, API_BASE_URL, or relative path)
const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (import.meta.env.VITE_API_BASE_URL) {
        const base = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
        return base.endsWith('/api') ? `${base}/v1` : `${base}/api/v1`;
    }
    return '/api/v1';
};

const API_URL = getApiUrl();

class TranslationQueue {
    constructor() {
        this.queue = [];
        this.timer = null;
        this.isProcessing = false;
        // Batching settings
        this.BATCH_INTERVAL_MS = 100;
        this.MAX_BATCH_SIZE = 100;
        // Global language settings tracker to avoid passing it to every call internally if possible
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;

        // Take up to MAX_BATCH_SIZE items
        const batch = this.queue.splice(0, this.MAX_BATCH_SIZE);
        
        // Group by source and target language to minimize multiple API calls
        // though normally targetLang is global.
        const groups = {};
        batch.forEach(item => {
            const groupKey = `${item.sourceLang}_${item.targetLang}`;
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(item);
        });

        // Fire off translations for each group
        for (const [groupKey, groupItems] of Object.entries(groups)) {
            const [sourceLang, targetLang] = groupKey.split('_');
            const texts = groupItems.map(i => i.text);

            try {
                const response = await fetch(`${API_URL}/translate/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts, targetLang, sourceLang })
                });

                if (!response.ok) {
                    throw new Error(`HTTP Error: ${response.status}`);
                }

                const json = await response.json();
                if (json.success && Array.isArray(json.data.translation)) {
                    json.data.translation.forEach((trans, index) => {
                        const originalItem = groupItems[index];
                        originalItem.resolve(trans);
                        
                        // Set frontend cache
                        const cacheKey = getCacheKeyParams(originalItem.text, targetLang, sourceLang);
                        translationCache.setCache(cacheKey, trans, originalItem.text);
                    });
                } else {
                    // Fallback to original
                    groupItems.forEach(item => item.resolve(item.text));
                }
            } catch (error) {
                console.error("Translation SDK Error:", error);
                groupItems.forEach(item => item.resolve(item.text));
            }
        }

        // Process next tick if items remain
        if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), 200); // Wait 200ms between batches to rate limit
        } else {
            this.isProcessing = false;
        }
    }

    scheduleProcess() {
        if (!this.timer && !this.isProcessing) {
            this.timer = setTimeout(() => {
                this.timer = null;
                this.processQueue();
            }, this.BATCH_INTERVAL_MS);
        }
    }

    add(text, targetLang, sourceLang = 'en') {
        return new Promise((resolve) => {
            this.queue.push({ text, targetLang, sourceLang, resolve });
            this.scheduleProcess();
        });
    }
}

const queue = new TranslationQueue();

/**
 * Translate a single text using caching and batching
 */
export const translateText = async (text, targetLang, sourceLang = 'en') => {
    if (!text || !text.trim() || targetLang === sourceLang) return text;
    
    targetLang = normalizeLanguageCode(targetLang);
    sourceLang = normalizeLanguageCode(sourceLang);

    const cacheKey = getCacheKeyParams(text, targetLang, sourceLang);
    const cached = await translationCache.getCache(cacheKey);
    
    if (cached) return cached;

    return queue.add(text, targetLang, sourceLang);
};

/**
 * Translate a batch of strings immediately
 */
export const translateBatch = async (texts, targetLang, sourceLang = 'en') => {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    
    const results = await Promise.all(texts.map(text => translateText(text, targetLang, sourceLang)));
    return results;
};

/**
 * Translate properties of an object
 */
export const translateObject = async (obj, targetLang, sourceLang = 'en', keysToTranslate = []) => {
    if (!obj || typeof obj !== 'object' || targetLang === sourceLang) return obj;

    const newObj = { ...obj };
    const promises = [];
    const keyMap = [];

    keysToTranslate.forEach(key => {
        if (newObj[key]) {
            promises.push(translateText(String(newObj[key]), targetLang, sourceLang));
            keyMap.push(key);
        }
    });

    if (promises.length === 0) return newObj;

    const translations = await Promise.all(promises);

    keyMap.forEach((key, index) => {
        newObj[key] = translations[index];
    });

    return newObj;
};

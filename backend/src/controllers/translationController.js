import * as translationService from '../services/translationService.js';

export const translateText = async (req, res, next) => {
    try {
        const { text, targetLang, sourceLang = 'en' } = req.body;
        
        if (!text || !targetLang) {
            return res.status(400).json({ success: false, message: 'text and targetLang are required' });
        }

        const translation = await translationService.translateText(text, targetLang, sourceLang);
        
        res.status(200).json({
            success: true,
            data: {
                original: text,
                translation: translation,
                sourceLang,
                targetLang
            }
        });
    } catch (error) {
        if (error.code === 429) {
            res.set('Retry-After', '5');
        }
        next(error);
    }
};

export const translateBatch = async (req, res, next) => {
    try {
        const { texts, targetLang, sourceLang = 'en' } = req.body;
        
        if (!Array.isArray(texts) || !targetLang) {
            return res.status(400).json({ success: false, message: 'texts array and targetLang are required' });
        }

        if (texts.length > 100) {
            return res.status(400).json({ success: false, message: 'Maximum 100 texts allowed per batch' });
        }

        const translations = await translationService.translateBatch(texts, targetLang, sourceLang);
        
        res.status(200).json({
            success: true,
            data: {
                original: texts,
                translation: translations,
                sourceLang,
                targetLang
            }
        });
    } catch (error) {
        if (error.code === 429) {
            res.set('Retry-After', '5');
        }
        next(error);
    }
};

export const translateObject = async (req, res, next) => {
    try {
        const { obj, targetLang, sourceLang = 'en', keysToTranslate } = req.body;
        
        if (!obj || typeof obj !== 'object' || !targetLang || !Array.isArray(keysToTranslate)) {
            return res.status(400).json({ success: false, message: 'obj, targetLang, and keysToTranslate array are required' });
        }

        const translation = await translationService.translateObject(obj, targetLang, sourceLang, keysToTranslate);
        
        res.status(200).json({
            success: true,
            data: {
                original: obj,
                translation: translation,
                sourceLang,
                targetLang
            }
        });
    } catch (error) {
        if (error.code === 429) {
            res.set('Retry-After', '5');
        }
        next(error);
    }
};

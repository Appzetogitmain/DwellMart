import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Settings from '../../../models/Settings.model.js';
import sanitizeHtml from 'sanitize-html';

// P0-07 FIX: Same sanitization allowlist as staticPages.controller.js
const SANITIZE_OPTIONS = {
    allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'strong', 'em', 'u', 'b', 'i',
        'ul', 'ol', 'li',
        'a', 'blockquote', 'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'div', 'span',
    ],
    allowedAttributes: {
        'a': ['href', 'title', 'target', 'rel'],
        'table': ['border', 'cellpadding', 'cellspacing'],
        '*': ['class', 'style'],
    },
    allowedStyles: {
        '*': {
            'color': [/^[a-zA-Z#0-9()., ]+$/],
            'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
            'font-weight': [/^bold$/, /^normal$/, /^\d+$/],
            'font-size': [/^\d+(px|em|rem|%)$/],
        },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
};

const TERMS_KEY = 'vendor_terms_and_conditions';

// GET /api/admin/settings/vendor-terms
export const getVendorTerms = asyncHandler(async (req, res) => {
    const setting = await Settings.findOne({ key: TERMS_KEY });
    res.status(200).json(new ApiResponse(200, {
        content: setting?.value?.content || '',
        lastUpdated: setting?.updatedAt || null,
    }, 'Vendor terms fetched.'));
});

// PUT /api/admin/settings/vendor-terms
export const updateVendorTerms = asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content || !String(content).trim()) {
        throw new ApiError(400, 'Terms content is required.');
    }

    // P0-07 FIX: Sanitize HTML content before storing to prevent stored XSS
    const sanitizedContent = sanitizeHtml(String(content).trim(), SANITIZE_OPTIONS);
    if (!sanitizedContent) {
        throw new ApiError(400, 'Terms content is empty after sanitization.');
    }

    const setting = await Settings.findOneAndUpdate(
        { key: TERMS_KEY },
        { key: TERMS_KEY, value: { content: sanitizedContent } },
        { upsert: true, new: true }
    );

    res.status(200).json(new ApiResponse(200, {
        content: setting.value.content,
        lastUpdated: setting.updatedAt,
    }, 'Vendor terms updated.'));
});

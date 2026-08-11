import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Settings from '../../../models/Settings.model.js';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_SLUGS = ['about', 'contact', 'terms', 'privacy', 'returns', 'shipping', 'faq', 'partner'];

// P0-07 FIX: Strict server-side sanitization allowlist for admin-editable CMS HTML.
// Only safe structural and formatting elements are permitted.
// This prevents XSS payloads from being stored and rendered via dangerouslySetInnerHTML.
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
    // Disallow any javascript: URLs in href
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
};

const sanitizePage = (content) => sanitizeHtml(String(content || '').trim(), SANITIZE_OPTIONS);


const slugToKey = (slug) => `page_${slug}`;

// GET /api/admin/pages/:slug  (admin)
// GET /api/pages/:slug        (public — same handler)
export const getPage = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    if (!ALLOWED_SLUGS.includes(slug)) {
        throw new ApiError(404, 'Page not found.');
    }
    const setting = await Settings.findOne({ key: slugToKey(slug) });
    res.status(200).json(new ApiResponse(200, {
        slug,
        title: setting?.value?.title || '',
        content: setting?.value?.content || '',
        lastUpdated: setting?.updatedAt || null,
    }, 'Page fetched.'));
});

// PUT /api/admin/pages/:slug  (admin only)
export const updatePage = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    if (!ALLOWED_SLUGS.includes(slug)) {
        throw new ApiError(404, 'Page not found.');
    }
    const { title, content } = req.body;
    if (!content || !String(content).trim()) {
        throw new ApiError(400, 'Page content is required.');
    }

    const key = slugToKey(slug);
    // P0-07 FIX: Sanitize HTML content before storing — strips all script, event handlers,
    // and disallowed tags. Safe structural and formatting HTML is preserved.
    const sanitizedContent = sanitizePage(content);
    if (!sanitizedContent) {
        throw new ApiError(400, 'Page content is empty after sanitization. Please remove any disallowed HTML.');
    }
    const setting = await Settings.findOneAndUpdate(
        { key },
        { key, value: { title: String(title || '').trim(), content: sanitizedContent } },
        { upsert: true, new: true }
    );

    res.status(200).json(new ApiResponse(200, {
        slug,
        title: setting.value.title,
        content: setting.value.content,
        lastUpdated: setting.updatedAt,
    }, 'Page updated successfully.'));
});

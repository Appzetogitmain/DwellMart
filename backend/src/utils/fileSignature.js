/**
 * Magic-byte file type detection.
 *
 * Upload validation trusted two things the client controls entirely:
 *
 *   • `file.mimetype` — this is just the request's `Content-Type` header.
 *   • `path.extname(file.originalname)` — the client's filename.
 *
 * So `payload.html` declared as `image/png` passed the MIME allowlist and was
 * written to disk keeping its `.html` extension. `/uploads` is served by
 * `express.static`, which infers `text/html` from that extension — stored XSS
 * on the application origin, which then reads the auth token out of
 * localStorage.
 *
 * This reads the actual leading bytes instead. No new dependency: the
 * signatures for the handful of types accepted here are short and stable.
 */

import fs from 'node:fs/promises';

/**
 * @typedef {{ mime: string, ext: string }} DetectedType
 */

/** Longest signature offset we need to read. */
const HEADER_BYTES = 32;

const startsWith = (buf, bytes, offset = 0) =>
    bytes.every((b, i) => b === null || buf[offset + i] === b);

/**
 * Signature table. `null` means "any byte" for variable positions.
 * Ordered so more specific checks run before broader ones.
 */
const SIGNATURES = [
    { mime: 'image/jpeg', ext: '.jpg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
    { mime: 'image/png', ext: '.png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { mime: 'image/gif', ext: '.gif', test: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
    {
        mime: 'image/webp',
        ext: '.webp',
        // RIFF....WEBP
        test: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8),
    },
    { mime: 'application/pdf', ext: '.pdf', test: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) }, // %PDF
    {
        // .docx / .xlsx are ZIP containers. Accepted only where the caller
        // allows the corresponding MIME, so a bare ZIP cannot slip through as
        // an image.
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ext: '.docx',
        test: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]),
    },
    {
        // Legacy OLE2 container used by .doc / .xls
        mime: 'application/msword',
        ext: '.doc',
        test: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    },
];

/**
 * Detect a buffer's real type from its leading bytes.
 * @returns {DetectedType|null} null when the content matches nothing allowed
 */
export const detectFromBuffer = (buffer) => {
    if (!buffer || buffer.length < 4) return null;
    for (const sig of SIGNATURES) {
        if (sig.test(buffer)) return { mime: sig.mime, ext: sig.ext };
    }
    return null;
};

/** Detect a file's real type by reading only its header. */
export const detectFromFile = async (filePath) => {
    let handle;
    try {
        handle = await fs.open(filePath, 'r');
        const buffer = Buffer.alloc(HEADER_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
        return detectFromBuffer(buffer.subarray(0, bytesRead));
    } catch {
        return null;
    } finally {
        await handle?.close().catch(() => {});
    }
};

/**
 * Canonical extension for an allowed MIME type.
 *
 * The stored filename's extension comes from HERE, never from the uploaded
 * filename — that is what stops an arbitrary extension reaching disk.
 */
export const canonicalExtension = (mime) => {
    const match = SIGNATURES.find((s) => s.mime === mime);
    return match ? match.ext : '';
};

/**
 * Some types are interchangeable enough that a strict equality check would
 * reject legitimate uploads: browsers label JPEGs as both `image/jpeg` and
 * `image/jpg`, and Office formats share container signatures.
 */
const EQUIVALENT = {
    'image/jpg': 'image/jpeg',
    'application/msword': 'application/msword',
};

const normalizeMime = (mime) => EQUIVALENT[String(mime || '').toLowerCase()] || String(mime || '').toLowerCase();

/**
 * Verify a file on disk is genuinely one of the allowed types.
 *
 * @param {string} filePath
 * @param {string[]} allowedMimeTypes
 * @returns {Promise<{ ok: boolean, detected: DetectedType|null, reason?: string }>}
 */
export const verifyFileContent = async (filePath, allowedMimeTypes = []) => {
    const detected = await detectFromFile(filePath);

    if (!detected) {
        return {
            ok: false,
            detected: null,
            reason: 'File content does not match any accepted file type.',
        };
    }

    const allowed = allowedMimeTypes.map(normalizeMime);
    if (!allowed.includes(normalizeMime(detected.mime))) {
        return {
            ok: false,
            detected,
            reason: `File content is ${detected.mime}, which is not accepted here.`,
        };
    }

    return { ok: true, detected };
};

import crypto from 'crypto';
import IntegrationPartner from '../../../models/IntegrationPartner.model.js';
import ApiError from '../../../utils/ApiError.js';

const normalizeIp = (ip = '') => String(ip || '').replace('::ffff:', '').trim();

const hashApiKey = (rawApiKey = '') => {
    const pepper = String(process.env.INTEGRATION_API_KEY_PEPPER || '').trim();
    return crypto
        .createHash('sha256')
        .update(`${pepper}:${String(rawApiKey)}`)
        .digest('hex');
};

const hashApiKeyWithoutPepper = (rawApiKey = '') =>
    crypto.createHash('sha256').update(String(rawApiKey)).digest('hex');

const safeCompare = (left, right) => {
    const a = String(left || '');
    const b = String(right || '');
    if (!a || !b || a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const isIpAllowed = (requestIp = '', allowedList = []) => {
    if (!Array.isArray(allowedList) || allowedList.length === 0) return true;
    const normalizedIp = normalizeIp(requestIp);
    return allowedList.some((value) => normalizeIp(value) === normalizedIp);
};

const parseScopes = (rawScopes = []) => {
    if (Array.isArray(rawScopes)) return rawScopes.map((scope) => String(scope || '').trim()).filter(Boolean);
    if (typeof rawScopes === 'string') {
        return rawScopes
            .split(',')
            .map((scope) => scope.trim())
            .filter(Boolean);
    }
    return [];
};

const authenticateFromEnvironment = ({ clientId, apiKey }) => {
    const envClientId = String(process.env.INTEGRATION_CLIENT_ID || '').trim();
    const envApiKey = String(process.env.INTEGRATION_API_KEY || '').trim();
    if (!envClientId || !envApiKey) return null;

    // P2-SEC-05 FIX: Use timing-safe comparison to prevent timing oracle attacks.
    // Plain `!==` leaks how many characters matched, enabling credential brute-force.
    if (!safeCompare(clientId, envClientId) || !safeCompare(apiKey, envApiKey)) return null;

    return {
        id: null,
        clientId: envClientId,
        name: String(process.env.INTEGRATION_PARTNER_NAME || 'Configured Delivery Partner').trim(),
        allowedScopes: parseScopes(process.env.INTEGRATION_SCOPES || 'orders:read,orders:write,inventory:write'),
        allowedIpAddresses: [],
        source: 'config',
    };
};

export const partnerAuth = (requiredScopes = []) => async (req, res, next) => {
    try {
        const clientId = String(req.headers['x-client-id'] || '').trim();
        const apiKey = String(req.headers['x-api-key'] || '').trim();

        if (!clientId || !apiKey) {
            console.warn(`[Integration Auth] Missing credentials for ${req.method} ${req.originalUrl}`);
            throw new ApiError(401, 'Missing integration credentials. Provide x-client-id and x-api-key headers.');
        }

        let partner = await IntegrationPartner.findOne({ clientId })
            .select('+apiKeyHash name clientId isActive allowedScopes allowedIpAddresses')
            .lean();

        if (!partner) {
            const envPartner = authenticateFromEnvironment({ clientId, apiKey });
            if (!envPartner) {
                console.warn(`[Integration Auth] Unknown clientId=${clientId}`);
                throw new ApiError(401, 'Invalid integration credentials.');
            }
            partner = envPartner;
        } else {
            if (!partner.isActive) {
                console.warn(`[Integration Auth] Inactive partner clientId=${clientId}`);
                throw new ApiError(403, 'Integration partner is inactive.');
            }

            const expectedHash = String(partner.apiKeyHash || '');
            const candidateHash = hashApiKey(apiKey);
            const legacyHash = hashApiKeyWithoutPepper(apiKey);
            const isValidKey =
                safeCompare(candidateHash, expectedHash) ||
                safeCompare(legacyHash, expectedHash) ||
                safeCompare(apiKey, expectedHash);
            if (!isValidKey) {
                console.warn(`[Integration Auth] Invalid API key for clientId=${clientId}`);
                throw new ApiError(401, 'Invalid integration credentials.');
            }
        }

        if (!isIpAllowed(req.ip, partner.allowedIpAddresses)) {
            console.warn(`[Integration Auth] Blocked IP=${req.ip} for clientId=${clientId}`);
            throw new ApiError(403, 'Request IP is not allowed for this integration partner.');
        }

        const partnerScopes = new Set(
            parseScopes(partner.allowedScopes || 'orders:read,orders:write,inventory:write')
        );
        const missingScope = requiredScopes.find((scope) => !partnerScopes.has(scope));
        if (missingScope) {
            console.warn(`[Integration Auth] Missing scope=${missingScope} for clientId=${clientId}`);
            throw new ApiError(403, `Forbidden. Missing required scope: ${missingScope}.`);
        }

        req.integrationPartner = {
            id: partner.id || String(partner._id || ''),
            clientId: partner.clientId,
            name: partner.name,
            allowedScopes: [...partnerScopes],
            source: partner.source || 'database',
        };

        if (partner._id) {
            await IntegrationPartner.updateOne(
                { _id: partner._id },
                { $set: { lastUsedAt: new Date() } }
            );
        }

        return next();
    } catch (error) {
        return next(error);
    }
};

export default partnerAuth;

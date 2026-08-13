/**
 * Environment contract.
 *
 * Two stages, deliberately:
 *
 *   Stage A (`ENV_CONTRACT_MODE=warn`, the default) logs one CONFIG_VIOLATION
 *   line per breach and boots. This is what ships first, so a misconfigured
 *   environment is discovered from logs rather than from an outage.
 *
 *   Stage B (`ENV_CONTRACT_MODE=enforce`) throws. Only flip this once the
 *   warning count has been zero in the target environment for a full soak.
 *
 * Violations never include the offending value — only the key — because this
 * output lands in log aggregation.
 */

const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

/** Required in every environment. */
const ALWAYS_REQUIRED = [
    'MONGO_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
];

/**
 * Required only in production. Absent locally so a developer can boot without
 * a full credential set, present in production because each one silently
 * degrades a user-facing capability when missing.
 */
const PRODUCTION_REQUIRED = [
    'NODE_ENV',
    'CLIENT_URL',
    'CASHFREE_APP_ID',
    'CASHFREE_SECRET_KEY',
    'CASHFREE_ENV',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
];

/**
 * Must NOT be set in production. Each of these disables a real control:
 * mock OTP bypasses account verification, geo-fencing disabled removes the
 * Quick Commerce delivery radius, and sanitize-mode disables the product
 * field guard.
 */
const PRODUCTION_FORBIDDEN = [
    { key: 'USE_MOCK_OTP', when: (v) => ['true', '1'].includes(String(v).toLowerCase()) },
    { key: 'MOCK_OTP', when: (v) => Boolean(String(v || '').trim()) },
    { key: 'DISABLE_GEO_FENCING', when: (v) => String(v).toLowerCase() === 'true' },
    // Note: this guard defaults to observe-only. It is not listed as forbidden
    // because the safe production value is now `true` (enforce), not its
    // absence — see productCapabilityGuard.js.
];

/** Value assertions that only make sense once the key is present. */
const VALUE_ASSERTIONS = [
    {
        key: 'CASHFREE_ENV',
        productionOnly: true,
        assert: (v) => String(v || '').toLowerCase().includes('prod'),
        message: 'must be a production value when NODE_ENV=production (sandbox credentials cannot take real payments)',
    },
    {
        key: 'JWT_SECRET',
        productionOnly: true,
        assert: (v) => String(v || '').length >= 32,
        message: 'must be at least 32 characters in production',
    },
    {
        key: 'JWT_REFRESH_SECRET',
        productionOnly: true,
        assert: (v) => String(v || '').length >= 32,
        message: 'must be at least 32 characters in production',
    },
    {
        key: 'INTEGRATION_API_KEY_PEPPER',
        productionOnly: true,
        // Only asserted when partner integrations are configured at all.
        appliesWhen: () => Boolean(String(process.env.INTEGRATION_CLIENT_ID || '').trim()),
        assert: (v) => Boolean(String(v || '').trim()),
        message: 'must be non-empty when integration partners are configured (an empty pepper reduces key hashing to plain SHA-256)',
    },
];

/**
 * Collect every contract breach without throwing.
 * @returns {Array<{key: string, reason: string}>}
 */
export const collectEnvViolations = () => {
    const violations = [];
    const production = isProduction();

    for (const key of ALWAYS_REQUIRED) {
        if (!process.env[key]) violations.push({ key, reason: 'is required but not set' });
    }

    if (production) {
        for (const key of PRODUCTION_REQUIRED) {
            if (!process.env[key]) violations.push({ key, reason: 'is required in production but not set' });
        }

        for (const { key, when } of PRODUCTION_FORBIDDEN) {
            const value = process.env[key];
            if (value !== undefined && when(value)) {
                violations.push({ key, reason: 'must not be enabled in production' });
            }
        }
    }

    for (const { key, productionOnly, appliesWhen, assert, message } of VALUE_ASSERTIONS) {
        if (productionOnly && !production) continue;
        if (typeof appliesWhen === 'function' && !appliesWhen()) continue;
        if (process.env[key] === undefined) continue; // absence is reported by the required checks
        if (!assert(process.env[key])) violations.push({ key, reason: message });
    }

    return violations;
};

/**
 * Validate the environment at boot.
 *
 * @param {{ mode?: 'warn'|'enforce' }} [options]
 * @returns {{ violations: Array<{key: string, reason: string}> }}
 */
export const validateEnv = (options = {}) => {
    const mode = String(
        options.mode || process.env.ENV_CONTRACT_MODE || 'warn'
    ).toLowerCase();

    const violations = collectEnvViolations();

    if (violations.length === 0) {
        console.log('Environment variables validated successfully');
        return { violations };
    }

    for (const { key, reason } of violations) {
        console.error(`CONFIG_VIOLATION key=${key} reason="${reason}"`);
    }

    if (mode === 'enforce') {
        throw new Error(
            `Environment contract failed with ${violations.length} violation(s): ${violations
                .map((v) => v.key)
                .join(', ')}. Set ENV_CONTRACT_MODE=warn to boot anyway.`
        );
    }

    console.warn(
        `⚠️  ${violations.length} environment contract violation(s) detected. `
        + 'Booting anyway because ENV_CONTRACT_MODE is not "enforce".'
    );

    return { violations };
};

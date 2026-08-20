/**
 * WhatsApp (Interakt) Configuration
 *
 * Central configuration for the Interakt WhatsApp Business integration.
 * ALL values sourced from environment variables — never hard-coded.
 *
 * SCOPE: OTP delivery only. Interakt can only send templates Meta has
 * approved, and `otp_temp` is the only approved template this integration is
 * permitted to use. Order, payment, settlement and marketing messaging is
 * deliberately absent because the templates for it do not exist yet.
 *
 * Required env vars (production, once enabled):
 *   INTERAKT_API_KEY               — Base64 key from Interakt Developer Settings
 *
 * Optional env vars:
 *   WHATSAPP_ENABLED               — master kill switch (default: false)
 *   WHATSAPP_OTP_ENABLED           — route OTP over WhatsApp (default: true when enabled)
 *   WHATSAPP_DRY_RUN               — build + log the payload, never call Interakt
 *   WHATSAPP_DEFAULT_COUNTRY_CODE  — dial code for bare national numbers (default: +91)
 *   WHATSAPP_TIMEOUT_MS            — HTTP timeout (default: 10000)
 *   WHATSAPP_TEMPLATE_LANGUAGE     — template language code (default: en)
 *   INTERAKT_WEBHOOK_SECRET        — HMAC secret for delivery-status callbacks
 *   WHATSAPP_BUSINESS_NUMBER       — sending number, for operator diagnostics only
 */

const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

const isTruthy = (value) => ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

const whatsappConfig = {
    // Getters so values are read live from process.env (hot reload friendly,
    // and testable without re-importing the module).
    get enabled() { return isTruthy(getEnv('WHATSAPP_ENABLED', 'false')); },
    get dryRun() { return isTruthy(getEnv('WHATSAPP_DRY_RUN', 'false')); },

    // ─── Auth & Credentials ────────────────────────────────────────────────
    /**
     * Interakt issues an already-base64-encoded HTTP Basic token. It is sent
     * verbatim as `Authorization: Basic <key>`; encoding it a second time is
     * the single most common integration failure and surfaces as an opaque 401.
     */
    get apiKey() { return getEnv('INTERAKT_API_KEY'); },
    get webhookSecret() { return getEnv('INTERAKT_WEBHOOK_SECRET'); },
    get businessNumber() { return getEnv('WHATSAPP_BUSINESS_NUMBER'); },

    // ─── Endpoints ─────────────────────────────────────────────────────────
    endpoints: {
        message: 'https://api.interakt.ai/v1/public/message/',
    },

    get timeoutMs() {
        const parsed = parseInt(getEnv('WHATSAPP_TIMEOUT_MS', '10000'), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
    },

    get templateLanguage() { return getEnv('WHATSAPP_TEMPLATE_LANGUAGE', 'en'); },

    // ─── Channel Switches ──────────────────────────────────────────────────
    /**
     * WhatsApp is only ever the FIRST attempt for an OTP; email remains the
     * fallback, so turning this off degrades delivery rather than breaking it.
     */
    get otpEnabled() {
        return this.enabled && isTruthy(getEnv('WHATSAPP_OTP_ENABLED', 'true'));
    },

    /**
     * True when the integration has everything it needs to actually send.
     * Checked before every send so a half-configured environment falls back to
     * email instead of throwing into an authentication flow.
     *
     * Dry-run deliberately does NOT require a key: the point of dry-run is to
     * validate payload construction in an environment that has no credentials.
     */
    isConfigured() {
        if (!this.otpEnabled) return false;
        return this.dryRun || Boolean(this.apiKey);
    },

    /** Operator-facing description of why sending is unavailable, if it is. */
    unavailableReason() {
        if (!this.enabled) return 'whatsapp_disabled';
        if (!isTruthy(getEnv('WHATSAPP_OTP_ENABLED', 'true'))) return 'otp_channel_disabled';
        if (!this.dryRun && !this.apiKey) return 'missing_api_key';
        return null;
    },
};

export { whatsappConfig };
export default whatsappConfig;

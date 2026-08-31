/**
 * DTDC Configuration
 *
 * Central configuration for the DTDC integration.
 * ALL values sourced from environment variables — never hard-coded.
 *
 * Required env vars:
 *   DTDC_CUSTOMER_CODE       — Customer code from DTDC
 *   DTDC_API_KEY             — API key for consignment endpoints
 *   DTDC_TRACKING_USERNAME   — Username for tracking API auth
 *   DTDC_TRACKING_PASSWORD   — Password for tracking API auth
 *
 * Optional env vars:
 *   DTDC_ENVIRONMENT         — 'sandbox' (default) or 'production'
 *   DTDC_TIMEOUT_MS          — HTTP timeout (default: 15000)
 *   DTDC_WEBHOOK_SECRET      — Shared secret for webhook signature validation
 *   DTDC_RETRY_ATTEMPTS      — Retry count for idempotent operations (default: 1)
 */

const getEnv = (key, defaultValue = '') => process.env[key] || defaultValue;

const dtdcConfig = {
    get environment() { return getEnv('DTDC_ENVIRONMENT', 'sandbox'); },

    // ─── Auth & Credentials ────────────────────────────────────────────────
    // Getters so values are read live from process.env (hot reload friendly).
    get apiKey()            { return getEnv('DTDC_API_KEY'); },
    get customerCode()      { return getEnv('DTDC_CUSTOMER_CODE'); },
    get trackingUsername()   { return getEnv('DTDC_TRACKING_USERNAME'); },
    get trackingPassword()  { return getEnv('DTDC_TRACKING_PASSWORD'); },
    get webhookSecret()     { return getEnv('DTDC_WEBHOOK_SECRET'); },

    // ─── Endpoints ─────────────────────────────────────────────────────────
    endpoints: {
        sandbox: {
            booking:          'https://alphademodashboardapi.shipsy.io/api/customer/integration/consignment/softdata',
            cancel:           'https://alphademodashboardapi.shipsy.io/api/customer/integration/consignment/cancel',
            label:            'https://alphademodashboardapi.shipsy.io/api/customer/integration/consignment/shippinglabel/stream',
            pincode:          'http://smarttrack.ctbsplus.dtdc.com/ratecalapi/PincodeApiCall',
            trackingAuth:     'https://blktracksvc.dtdc.com/dtdc-api/api/dtdc/authenticate',
            trackingDetails:  'https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails',
        },
        production: {
            booking:          'https://pxapi.dtdc.in/api/customer/integration/consignment/softdata',
            cancel:           'https://pxapi.dtdc.in/api/customer/integration/consignment/cancel',
            label:            'https://pxapi.dtdc.in/api/customer/integration/consignment/shippinglabel/stream',
            pincode:          'http://smarttrack.ctbsplus.dtdc.com/ratecalapi/PincodeApiCall',
            trackingAuth:     'https://blktracksvc.dtdc.com/dtdc-api/api/dtdc/authenticate',
            trackingDetails:  'https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails',
        },
    },

    /**
     * DTDC's commodity list is numeric; 7 is OTHERS, the correct generic
     * default. Overridable so an operator can change it without a deploy.
     */
    get defaultCommodityId() { return parseInt(getEnv('DTDC_DEFAULT_COMMODITY_ID', '7'), 10); },

    get timeoutMs() { return parseInt(getEnv('DTDC_TIMEOUT_MS', '15000'), 10); },
    get retryAttempts() { return parseInt(getEnv('DTDC_RETRY_ATTEMPTS', '1'), 10); },

    /** Return the correct endpoint set for the current environment. */
    getEndpoints() {
        return this.environment === 'production'
            ? this.endpoints.production
            : this.endpoints.sandbox;
    },

    /**
     * Validate that all mandatory DTDC configuration is present.
     * Returns { valid, missing[] }.
     */
    validate() {
        const required = [
            { key: 'DTDC_CUSTOMER_CODE', accessor: 'customerCode' },
            { key: 'DTDC_API_KEY',       accessor: 'apiKey' },
        ];
        const missing = required.filter((r) => !this[r.accessor]).map((r) => r.key);
        return { valid: missing.length === 0, missing };
    },

    /**
     * Safe representation for logging — never includes secret values.
     */
    toSafeString() {
        return JSON.stringify({
            environment:    this.environment,
            customerCode:   this.customerCode ? `***${this.customerCode.slice(-3)}` : 'NOT_SET',
            apiKey:         this.apiKey        ? 'SET' : 'NOT_SET',
            trackingUser:   this.trackingUsername ? 'SET' : 'NOT_SET',
            webhookSecret:  this.webhookSecret  ? 'SET' : 'NOT_SET',
            timeoutMs:      this.timeoutMs,
        });
    },
};

export { dtdcConfig };
export default dtdcConfig;

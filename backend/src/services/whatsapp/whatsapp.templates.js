/**
 * WhatsApp template registry.
 *
 * Meta only delivers templates it has approved, so this registry is an
 * allowlist rather than a convenience: a name that is not here cannot be sent,
 * and adding one without a corresponding approved template in Interakt would
 * produce sends that are accepted by the API and silently never delivered.
 *
 * Exactly ONE template is registered.
 *
 *   otp_temp — Authentication category, English (en), one body variable, with
 *   a Copy Code button, five-minute validity.
 *
 * The account also holds `update_regarding_case` (Utility). It is deliberately
 * NOT registered: it is an Interakt-supplied support template whose button is a
 * STATIC link to the site root, so it cannot address an order, and it has no
 * role in authentication.
 */

/** Registered template identifiers. */
export const WhatsAppTemplates = Object.freeze({
    OTP: 'otp_temp',
});

/**
 * Authentication templates carrying a Copy Code button require the code in the
 * body AND in the button payload. Interakt's documentation is explicit: "send
 * the same auth code in both the body and button values." Supplying only the
 * body yields a message that reports success and never reaches the handset,
 * which is indistinguishable from a template problem at the call site.
 */
const TEMPLATE_SPECS = Object.freeze({
    [WhatsAppTemplates.OTP]: Object.freeze({
        name: 'otp_temp',
        category: 'AUTHENTICATION',
        bodyVariableCount: 1,
        hasCopyCodeButton: true,
        /** Meta's ceiling for an authentication code. */
        maxCodeLength: 15,
    }),
});

export const getTemplateSpec = (templateName) => TEMPLATE_SPECS[templateName] || null;

export const isRegisteredTemplate = (templateName) => Boolean(TEMPLATE_SPECS[templateName]);

/**
 * Build the `template` half of an Interakt send payload for the OTP template.
 *
 * @param   {object} params
 * @param   {string} params.code      the verification code
 * @param   {string} [params.languageCode]
 * @returns {object} the `template` object, ready to embed in a send payload
 * @throws  {Error}  when the code cannot legally be carried by the template
 */
export const buildOtpTemplatePayload = ({ code, languageCode = 'en' }) => {
    const spec = TEMPLATE_SPECS[WhatsAppTemplates.OTP];
    const value = String(code ?? '').trim();

    if (!value) {
        throw new Error('WhatsApp OTP template requires a code');
    }
    if (value.length > spec.maxCodeLength) {
        throw new Error(`WhatsApp OTP code exceeds ${spec.maxCodeLength} characters`);
    }

    return {
        name: spec.name,
        languageCode: String(languageCode || 'en'),
        bodyValues: [value],
        // Same code in both halves — see the note above.
        buttonValues: { 0: [value] },
    };
};

export default { WhatsAppTemplates, getTemplateSpec, isRegisteredTemplate, buildOtpTemplatePayload };

/**
 * Delivery Provider Architecture
 * 
 * Resolves the correct delivery provider based on the canonical order channel.
 * The frontend CANNOT override this — it is server-side authoritative.
 * 
 * retail → DTDC
 * wholesale → DTDC
 * quick_commerce → INTERNAL (existing rider system)
 */

import { resolveOrderChannel } from '../orderChannel.service.js';
import { VendorChannels } from '../../constants/vendorChannels.js';

export const DeliveryProviders = Object.freeze({
    DTDC: 'dtdc',
    INTERNAL: 'internal',
});

const CHANNEL_TO_PROVIDER = Object.freeze({
    [VendorChannels.RETAIL]: DeliveryProviders.DTDC,
    [VendorChannels.WHOLESALE]: DeliveryProviders.DTDC,
    [VendorChannels.QUICK_COMMERCE]: DeliveryProviders.INTERNAL,
});

/**
 * Resolve the delivery provider for an order.
 * 
 * This is the SINGLE SOURCE OF TRUTH for delivery routing.
 * The result is derived entirely from the server-side order channel.
 * Client-supplied deliveryProvider values are ignored.
 * 
 * @param {object} order The order document
 * @param {string} [vendorId] Optional vendor ID for multi-vendor orders
 * @returns {{ provider: string, channel: string }}
 * @throws {Error} If channel cannot be resolved
 */
export const resolveDeliveryProvider = (order, vendorId = null) => {
    const channel = resolveOrderChannel(order, vendorId);
    const provider = CHANNEL_TO_PROVIDER[channel];
    
    if (!provider) {
        throw new Error(
            `Cannot resolve delivery provider for channel "${channel}". ` +
            `Valid channels: ${Object.keys(CHANNEL_TO_PROVIDER).join(', ')}`
        );
    }
    
    return { provider, channel };
};

/**
 * Check if an order should use DTDC delivery.
 * @param {object} order
 * @param {string} [vendorId]
 * @returns {boolean}
 */
export const isDtdcOrder = (order, vendorId = null) => {
    try {
        const { provider } = resolveDeliveryProvider(order, vendorId);
        return provider === DeliveryProviders.DTDC;
    } catch {
        return false;
    }
};

/**
 * Check if an order should use internal (Quick Commerce) delivery.
 * @param {object} order
 * @param {string} [vendorId]
 * @returns {boolean}
 */
export const isInternalDelivery = (order, vendorId = null) => {
    try {
        const { provider } = resolveDeliveryProvider(order, vendorId);
        return provider === DeliveryProviders.INTERNAL;
    } catch {
        return false;
    }
};

/**
 * Assert that a provider assignment is valid for the given order.
 * Prevents client-side override attacks.
 * 
 * @param {object} order
 * @param {string} requestedProvider Provider the client is requesting
 * @param {string} [vendorId]
 * @throws {Error} If the requested provider doesn't match the canonical provider
 */
export const assertProviderMatch = (order, requestedProvider, vendorId = null) => {
    const { provider, channel } = resolveDeliveryProvider(order, vendorId);
    const normalized = String(requestedProvider || '').trim().toLowerCase();
    
    if (normalized && normalized !== provider) {
        throw new Error(
            `Delivery provider mismatch: channel "${channel}" requires ` +
            `"${provider}" but "${normalized}" was requested. ` +
            `The delivery provider is determined server-side and cannot be overridden.`
        );
    }
};

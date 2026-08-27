import {
    VENDOR_CHANNEL_VALUES,
    VendorChannelStatuses,
    VendorChannels,
    getVendorChannelState,
    listVendorChannels,
    normalizeVendorChannel,
    vendorChannelPath,
} from '../constants/vendorChannels.js';
import { quickCommerceReadiness } from './vendorChannelTransition.service.js';

const requestedState = (requested, now = new Date()) => ({
    status: requested ? VendorChannelStatuses.REQUESTED : VendorChannelStatuses.DISABLED,
    requestedAt: requested ? now : null,
    requestedBy: requested ? 'vendor' : null,
});

export const requestedChannelsFromSellingChannels = (sellingChannels, now = new Date()) => ({
    retail: requestedState(sellingChannels?.retail?.enabled !== false, now),
    wholesale: requestedState(sellingChannels?.wholesale?.enabled === true, now),
    quickCommerce: requestedState(sellingChannels?.quickCommerce?.enabled === true, now),
});

export const legacyChannelForVendor = (vendor) => {
    const type = normalizeVendorChannel(vendor?.vendorType);
    return type || VendorChannels.RETAIL;
};

export const legacyChannelsForVendor = (vendor) => {
    const enabled = VENDOR_CHANNEL_VALUES.filter((channel) => {
        const path = vendorChannelPath(channel);
        return vendor?.sellingChannels?.[path]?.enabled === true;
    });
    return enabled.length > 0 ? enabled : [legacyChannelForVendor(vendor)];
};

export const channelAuthorityMode = () => {
    const mode = String(process.env.VENDOR_CHANNEL_AUTHORITY_MODE || 'channels').toLowerCase();
    return ['legacy', 'shadow', 'channels'].includes(mode) ? mode : 'channels';
};

export const effectiveReadableChannels = (vendor) => {
    const mode = channelAuthorityMode();
    if (mode === 'legacy') return legacyChannelsForVendor(vendor);
    return listVendorChannels(vendor, { readable: true });
};

export const effectiveWritableChannels = (vendor) => {
    const mode = channelAuthorityMode();
    if (mode === 'legacy') return legacyChannelsForVendor(vendor);
    return listVendorChannels(vendor);
};

export const channelSummary = (vendor) => ({
    activeWorkspaces: effectiveWritableChannels(vendor),
    readableWorkspaces: effectiveReadableChannels(vendor),
    channels: vendor?.channels || {},
    quickCommerceProfile: vendor?.quickCommerceProfile || null,
    quickCommerceReadiness: quickCommerceReadiness(vendor),
});

export const projectSellingChannels = (vendor) => ({
    retail: { enabled: getVendorChannelState(vendor, VendorChannels.RETAIL)?.status === VendorChannelStatuses.ACTIVE },
    wholesale: { enabled: getVendorChannelState(vendor, VendorChannels.WHOLESALE)?.status === VendorChannelStatuses.ACTIVE },
    quickCommerce: { enabled: getVendorChannelState(vendor, VendorChannels.QUICK_COMMERCE)?.status === VendorChannelStatuses.ACTIVE },
});


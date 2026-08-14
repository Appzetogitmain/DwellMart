export const VendorChannels = Object.freeze({
    RETAIL: 'retail',
    WHOLESALE: 'wholesale',
    QUICK_COMMERCE: 'quick_commerce',
});

export const VENDOR_CHANNEL_VALUES = Object.freeze(Object.values(VendorChannels));

export const VendorChannelStatuses = Object.freeze({
    REQUESTED: 'requested',
    ACTIVE: 'active',
    PAUSED: 'paused',
    REJECTED: 'rejected',
    DISABLED: 'disabled',
});

export const VENDOR_CHANNEL_STATUS_VALUES = Object.freeze(Object.values(VendorChannelStatuses));

export const VENDOR_CHANNEL_STATUS_TRANSITIONS = Object.freeze({
    [VendorChannelStatuses.REQUESTED]: Object.freeze([
        VendorChannelStatuses.ACTIVE,
        VendorChannelStatuses.REJECTED,
        VendorChannelStatuses.DISABLED,
    ]),
    [VendorChannelStatuses.ACTIVE]: Object.freeze([
        VendorChannelStatuses.PAUSED,
        VendorChannelStatuses.DISABLED,
    ]),
    [VendorChannelStatuses.PAUSED]: Object.freeze([
        VendorChannelStatuses.ACTIVE,
        VendorChannelStatuses.DISABLED,
    ]),
    [VendorChannelStatuses.REJECTED]: Object.freeze([VendorChannelStatuses.DISABLED]),
    [VendorChannelStatuses.DISABLED]: Object.freeze([]),
});

export const canTransitionVendorChannel = (from, to) =>
    VENDOR_CHANNEL_STATUS_TRANSITIONS[from]?.includes(to) === true;

const PATH_BY_CHANNEL = Object.freeze({
    [VendorChannels.RETAIL]: 'retail',
    [VendorChannels.WHOLESALE]: 'wholesale',
    [VendorChannels.QUICK_COMMERCE]: 'quickCommerce',
});

export const normalizeVendorChannel = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/-/g, '_');
    if (normalized === 'quickcommerce' || normalized === 'qc') return VendorChannels.QUICK_COMMERCE;
    return VENDOR_CHANNEL_VALUES.includes(normalized) ? normalized : null;
};

export const vendorChannelPath = (value) => {
    const channel = normalizeVendorChannel(value);
    return channel ? PATH_BY_CHANNEL[channel] : null;
};

export const getVendorChannelState = (vendor, value) => {
    const path = vendorChannelPath(value);
    return path ? vendor?.channels?.[path] ?? null : null;
};

export const isChannelReadable = (vendor, value) => {
    const status = getVendorChannelState(vendor, value)?.status;
    return status === VendorChannelStatuses.ACTIVE || status === VendorChannelStatuses.PAUSED;
};

export const isChannelWritable = (vendor, value) =>
    getVendorChannelState(vendor, value)?.status === VendorChannelStatuses.ACTIVE;

export const listVendorChannels = (vendor, { readable = false } = {}) =>
    VENDOR_CHANNEL_VALUES.filter((channel) =>
        readable ? isChannelReadable(vendor, channel) : isChannelWritable(vendor, channel)
    );

export const channelToProductFlag = (value) => ({
    [VendorChannels.RETAIL]: 'retailEnabled',
    [VendorChannels.WHOLESALE]: 'wholesaleEnabled',
    [VendorChannels.QUICK_COMMERCE]: 'quickCommerceEnabled',
}[normalizeVendorChannel(value)] || null);

export const channelToOrderType = (value) => normalizeVendorChannel(value);

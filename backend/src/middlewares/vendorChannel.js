import ApiError from '../utils/ApiError.js';
import {
    isChannelReadable,
    isChannelWritable,
    normalizeVendorChannel,
} from '../constants/vendorChannels.js';
import {
    channelAuthorityMode,
    effectiveReadableChannels,
    effectiveWritableChannels,
    legacyChannelsForVendor,
} from '../services/vendorChannel.service.js';

const channelError = (status, message, code) => {
    const error = new ApiError(status, message);
    error.errorCode = code;
    error.code = code;
    return error;
};

export const resolveVendorWorkspace = (req, res, next) => {
    const explicit = req.query?.workspace || req.headers['x-vendor-workspace'] || req.body?.workspace;
    let workspace = explicit ? normalizeVendorChannel(explicit) : null;
    if (explicit && !workspace) {
        return next(channelError(400, 'Invalid vendor workspace.', 'INVALID_WORKSPACE'));
    }

    const mode = channelAuthorityMode();
    const available = mode === 'legacy'
        ? legacyChannelsForVendor(req.vendor)
        : effectiveReadableChannels(req.vendor);

    if (!workspace && available.length === 1) workspace = available[0];
    if (!workspace && available.length > 1) {
        return next(channelError(400, 'Choose a workspace for this request.', 'WORKSPACE_REQUIRED'));
    }
    if (!workspace) {
        return next(channelError(403, 'No approved selling channel is available.', 'NO_ACTIVE_CHANNEL'));
    }

    req.vendorWorkspace = workspace;
    res.setHeader('Vary', 'X-Vendor-Workspace');
    return next();
};

export const requireChannel = ({ write = false } = {}) => (req, res, next) => {
    const workspace = req.vendorWorkspace;
    const mode = channelAuthorityMode();
    const allowed = mode === 'legacy'
        ? legacyChannelsForVendor(req.vendor).includes(workspace)
        : (write ? isChannelWritable(req.vendor, workspace) : isChannelReadable(req.vendor, workspace));

    if (!allowed) {
        return next(channelError(
            403,
            write
                ? 'This channel is not active for write operations.'
                : 'This channel is not available for this vendor.',
            write ? 'CHANNEL_NOT_WRITABLE' : 'CHANNEL_ACCESS_DENIED'
        ));
    }

    // Shadow mode authorizes from channels but records any legacy disagreement.
    if (mode === 'shadow') {
        const legacyAllowed = legacyChannelsForVendor(req.vendor).includes(workspace);
        if (legacyAllowed !== allowed) {
            console.warn(`[VendorChannelShadow] vendor=${req.user?.id} workspace=${workspace} legacy=${legacyAllowed} channels=${allowed}`);
        }
    }
    return next();
};

export const requireReadableChannel = [resolveVendorWorkspace, requireChannel({ write: false })];
export const requireWritableChannel = [resolveVendorWorkspace, requireChannel({ write: true })];

export const requireSpecificChannel = (expected, { write = false } = {}) => [
    resolveVendorWorkspace,
    (req, res, next) => {
        if (req.vendorWorkspace !== normalizeVendorChannel(expected)) {
            return next(channelError(403, 'This endpoint belongs to a different workspace.', 'WORKSPACE_MISMATCH'));
        }
        return requireChannel({ write })(req, res, next);
    },
];

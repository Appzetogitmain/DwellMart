import Settings from '../models/Settings.model.js';

export const isWholesaleMarketplaceEnabled = async () => {
    const setting = await Settings.findOne({ key: 'features' }).lean();
    return setting?.value?.wholesaleMarketplaceEnabled === true;
};

import Joi from 'joi';
import { DEFAULT_HOMEPAGE_SECTIONS } from '../../../services/homepageSections.service.js';

const keys = DEFAULT_HOMEPAGE_SECTIONS.map(({ key }) => key);
const productId = Joi.string().pattern(/^[a-f\d]{24}$/i);

export const homepageSectionsSchema = Joi.object({
    sections: Joi.array().length(keys.length).unique('key').items(Joi.object({
        key: Joi.string().valid(...keys).required(),
        enabled: Joi.boolean().required(),
        title: Joi.string().trim().min(1).max(80).required(),
        subtitle: Joi.string().trim().allow('').max(180).required(),
        limit: Joi.valid(6).required(),
        mode: Joi.string().valid('automatic', 'pinned_and_auto', 'manual').required(),
        pinnedIds: Joi.array().max(6).unique().items(productId).required(),
    }).unknown(false)).required(),
}).unknown(false).custom((value, helpers) => {
    const received = new Set(value.sections.map(({ key }) => key));
    if (keys.some((key) => !received.has(key))) return helpers.error('any.invalid');
    const pinned = value.sections.flatMap(({ pinnedIds }) => pinnedIds.map((id) => id.toLowerCase()));
    if (new Set(pinned).size !== pinned.length) return helpers.error('any.invalid');
    return value;
}, 'complete section set and unique pins');

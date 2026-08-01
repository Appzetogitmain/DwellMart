import { normalizeExperience } from '../constants/experiences.js';

/**
 * Resolves the shopping experience for a request into `req.experience`.
 *
 * Source order:
 *   1. `X-Experience` header  (preferred — keeps URLs cacheable and clean)
 *   2. `?experience=` query param (fallback for links/deep-links)
 *   3. 'marketplace' default  (backward compatible: existing clients unchanged)
 *
 * Mounted globally so every downstream consumer — controllers and the response
 * cache key builder alike — sees a single resolved value.
 */
export const resolveExperience = (req, res, next) => {
    req.experience = normalizeExperience(
        req.get('x-experience') ?? req.query?.experience
    );
    next();
};

export default resolveExperience;

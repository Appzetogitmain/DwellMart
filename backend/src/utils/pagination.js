/**
 * Standardized pagination parser for API list endpoints.
 * Supports numeric page & limit, string 'all' with safe maxLimit cap,
 * and calculates skip and total pages.
 */
export const parsePagination = (query = {}, options = {}) => {
    const defaultLimit = Math.max(1, Number(options.defaultLimit) || 20);
    const maxLimit = Math.max(defaultLimit, Number(options.maxLimit) || 1000);

    const rawPage = Number(query.page);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

    let limit;
    const rawLimitStr = String(query.limit ?? '').trim().toLowerCase();
    if (rawLimitStr === 'all') {
        limit = maxLimit;
    } else {
        const rawLimitNum = Number(query.limit);
        const requestedLimit = Number.isFinite(rawLimitNum) && rawLimitNum >= 1
            ? Math.floor(rawLimitNum)
            : defaultLimit;
        limit = Math.min(requestedLimit, maxLimit);
    }

    const skip = (page - 1) * limit;

    return {
        page,
        limit,
        skip,
        maxLimit,
        isAll: rawLimitStr === 'all',
        calculatePages: (total) => Math.ceil(Math.max(0, Number(total) || 0) / limit) || 1,
    };
};

export default parsePagination;

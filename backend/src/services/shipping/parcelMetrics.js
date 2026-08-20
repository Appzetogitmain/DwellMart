/**
 * Parcel metrics — the single definition of weight, dimensions and what a
 * courier will actually charge for them.
 *
 * Five call sites need these numbers: the checkout splitter (snapshotting onto
 * an order line), the consignment payload builder, the booking-time override,
 * the bulk-upload parser and the backfill. A formula duplicated across five
 * files is a formula that will disagree with itself, and the one that matters
 * here — volumetric weight — is the one a vendor gets invoiced on.
 *
 * Quick Commerce never reaches this module. Internal riders do not bill on
 * volumetric weight, and QC is excluded from the courier upstream.
 */

// ─── Bounds ────────────────────────────────────────────────────────────────
// Mirrors the Joi bounds in the product validators, so a value rejected at the
// form is also rejected if it arrives by any other route.

export const MAX_WEIGHT_KG = 100000;
export const MAX_DIMENSION_CM = 1000;

/**
 * The courier's volumetric divisor for air freight.
 *
 * DTDC bills on the higher of actual and volumetric weight, where volumetric
 * is (L × W × H) / 5000 with dimensions in centimetres. A large, light parcel
 * — a duvet, a lampshade — is charged on volume, which is exactly the case a
 * hardcoded fallback declares a fraction of.
 */
export const VOLUMETRIC_DIVISOR = 5000;

/**
 * The fallback used when a product carries no measured weight.
 *
 * Deliberately a named constant rather than a literal: it appears in the
 * payload builder, the backfill and the vendor-facing warning, and those three
 * must never drift apart.
 */
export const FALLBACK_WEIGHT_KG = 0.5;

/** Fallback parcel dimensions, in centimetres. */
export const FALLBACK_DIMENSIONS_CM = Object.freeze({ length: 20, width: 15, height: 10 });

// ─── Unit normalisation ────────────────────────────────────────────────────

/**
 * Convert a stored weight to kilograms.
 *
 * Vendors selling spices or jewellery think in grams and will type `250`
 * meaning 250 g. Storing the unit and normalising on read is cheaper than
 * fielding support tickets about a 250 kg earring.
 *
 * @returns {number|null} kilograms, or null when there is no usable value
 */
export const toKilograms = (value, unit = 'kg') => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const kg = String(unit || 'kg').toLowerCase() === 'g' ? n / 1000 : n;
    if (kg > MAX_WEIGHT_KG) return null;
    return Number(kg.toFixed(4));
};

/**
 * Convert a stored dimension to centimetres.
 * @returns {number|null} centimetres, or null when there is no usable value
 */
export const toCentimetres = (value, unit = 'cm') => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const cm = String(unit || 'cm').toLowerCase() === 'in' ? n * 2.54 : n;
    if (cm > MAX_DIMENSION_CM) return null;
    return Number(cm.toFixed(2));
};

/**
 * Flatten a `Product.shipping` sub-document into normalised kg/cm.
 *
 * @param {object} shipping
 * @returns {{weightKg:number|null, dims:{length:number,width:number,height:number}|null, source:string|null}}
 */
export const normalizeProductShipping = (shipping) => {
    if (!shipping || typeof shipping !== 'object') {
        return { weightKg: null, dims: null, source: null };
    }

    const weightKg = toKilograms(shipping.weight, shipping.weightUnit);
    const unit = shipping.dimensionUnit;
    const length = toCentimetres(shipping.length, unit);
    const width = toCentimetres(shipping.width, unit);
    const height = toCentimetres(shipping.height, unit);

    // A partial set of dimensions cannot describe a box. Reporting null is
    // honest; substituting a default for the missing axis is not.
    const dims = length && width && height ? { length, width, height } : null;

    return { weightKg, dims, source: shipping.source || null };
};

// ─── Chargeable weight ─────────────────────────────────────────────────────

/**
 * Volumetric weight in kilograms for a set of dimensions in centimetres.
 * @returns {number} 0 when the dimensions are incomplete
 */
export const volumetricWeight = (dims) => {
    if (!dims) return 0;
    const { length, width, height } = dims;
    if (![length, width, height].every((v) => Number.isFinite(Number(v)) && Number(v) > 0)) return 0;
    return Number(((Number(length) * Number(width) * Number(height)) / VOLUMETRIC_DIVISOR).toFixed(3));
};

/**
 * What the courier will actually bill: the greater of actual and volumetric.
 *
 * @param {number} actualKg
 * @param {object} dims centimetres
 * @returns {{chargeable:number, actual:number, volumetric:number, basis:'actual'|'volumetric'}}
 */
export const chargeableWeight = (actualKg, dims) => {
    const actual = Number.isFinite(Number(actualKg)) && Number(actualKg) > 0 ? Number(actualKg) : 0;
    const volumetric = volumetricWeight(dims);
    const chargeable = Math.max(actual, volumetric);
    return {
        chargeable: Number(chargeable.toFixed(3)),
        actual: Number(actual.toFixed(3)),
        volumetric,
        basis: volumetric > actual ? 'volumetric' : 'actual',
    };
};

// ─── Validation ────────────────────────────────────────────────────────────

/**
 * Validate a booking-time package override against the same bounds the product
 * form enforces. Returning reasons rather than throwing lets the caller reject
 * BEFORE contacting the carrier, which is the whole point.
 *
 * @param {object} override { weight, weightUnit, length, width, height, dimensionUnit }
 * @returns {{valid:boolean, errors:string[], weightKg:number|null, dims:object|null}}
 */
export const validatePackageOverride = (override = {}) => {
    const errors = [];
    const hasAny = ['weight', 'length', 'width', 'height'].some(
        (k) => override[k] !== undefined && override[k] !== null && override[k] !== ''
    );
    if (!hasAny) return { valid: true, errors, weightKg: null, dims: null };

    const weightUnit = override.weightUnit || 'kg';
    const dimensionUnit = override.dimensionUnit || 'cm';

    if (!['kg', 'g'].includes(String(weightUnit).toLowerCase())) errors.push('Weight unit must be kg or g.');
    if (!['cm', 'in'].includes(String(dimensionUnit).toLowerCase())) errors.push('Dimension unit must be cm or in.');

    let weightKg = null;
    if (override.weight !== undefined && override.weight !== null && override.weight !== '') {
        const raw = Number(override.weight);
        if (!Number.isFinite(raw) || raw <= 0) errors.push('Weight must be a positive number.');
        else {
            weightKg = toKilograms(raw, weightUnit);
            if (weightKg === null) errors.push(`Weight must not exceed ${MAX_WEIGHT_KG} kg.`);
        }
    }

    const axes = {};
    for (const axis of ['length', 'width', 'height']) {
        const value = override[axis];
        if (value === undefined || value === null || value === '') continue;
        const raw = Number(value);
        if (!Number.isFinite(raw) || raw <= 0) {
            errors.push(`${axis[0].toUpperCase()}${axis.slice(1)} must be a positive number.`);
            continue;
        }
        const cm = toCentimetres(raw, dimensionUnit);
        if (cm === null) errors.push(`${axis[0].toUpperCase()}${axis.slice(1)} must not exceed ${MAX_DIMENSION_CM} cm.`);
        else axes[axis] = cm;
    }

    const provided = ['length', 'width', 'height'].filter(
        (a) => override[a] !== undefined && override[a] !== null && override[a] !== ''
    );
    if (provided.length > 0 && provided.length < 3) {
        errors.push('Give all three dimensions, or none — a partial set cannot describe a parcel.');
    }

    const dims = Object.keys(axes).length === 3 ? axes : null;
    return { valid: errors.length === 0, errors, weightKg, dims };
};

export default {
    MAX_WEIGHT_KG,
    MAX_DIMENSION_CM,
    VOLUMETRIC_DIVISOR,
    FALLBACK_WEIGHT_KG,
    FALLBACK_DIMENSIONS_CM,
    toKilograms,
    toCentimetres,
    normalizeProductShipping,
    volumetricWeight,
    chargeableWeight,
    validatePackageOverride,
};

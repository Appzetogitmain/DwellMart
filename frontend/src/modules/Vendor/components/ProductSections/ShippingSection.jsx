/**
 * ShippingSection — parcel weight and dimensions.
 *
 * These are the numbers the courier declares a consignment with, and the ones
 * it bills against. Without them every parcel is declared at an estimated
 * 0.5 kg and 20 × 15 × 10 cm, which is how a fridge and a SIM card end up
 * shipping as the same weight.
 *
 * Rendered only for Retail and Wholesale — Quick Commerce is delivered by
 * DwellMart's own riders, who do not bill on volumetric weight. The gate is
 * `allowedFormSections.shipping` in vendorCapabilities.js.
 *
 * The live chargeable-weight readout is the point of the section rather than a
 * decoration: DTDC charges the HIGHER of actual and volumetric weight, and a
 * vendor who cannot see that rule will keep being surprised by the invoice.
 */
import { useMemo } from "react";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";

const VOLUMETRIC_DIVISOR = 5000;

/** Mirrors backend `parcelMetrics.chargeableWeight` so the two never disagree. */
export const previewChargeableWeight = (shipping = {}) => {
    const toKg = (v, unit) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return String(unit || "kg").toLowerCase() === "g" ? n / 1000 : n;
    };
    const toCm = (v, unit) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return String(unit || "cm").toLowerCase() === "in" ? n * 2.54 : n;
    };

    const actual = toKg(shipping.weight, shipping.weightUnit);
    const l = toCm(shipping.length, shipping.dimensionUnit);
    const w = toCm(shipping.width, shipping.dimensionUnit);
    const h = toCm(shipping.height, shipping.dimensionUnit);
    const volumetric = l && w && h ? (l * w * h) / VOLUMETRIC_DIVISOR : 0;

    return {
        actual: Number(actual.toFixed(3)),
        volumetric: Number(volumetric.toFixed(3)),
        chargeable: Number(Math.max(actual, volumetric).toFixed(3)),
        basis: volumetric > actual ? "volumetric" : "actual",
        hasAny: actual > 0 || volumetric > 0,
    };
};

/**
 * @param {object}   formData      the whole product form state
 * @param {Function} handleShipping (field, value) => void
 */
const ShippingSection = ({ formData, handleShipping }) => {
    const shipping = formData?.shipping || {};
    const metrics = useMemo(() => previewChargeableWeight(shipping), [shipping]);

    const onField = (field) => (e) => handleShipping(field, e.target.value);

    return (
        <div>
            <h2 className="text-base font-bold text-gray-800 mb-1">Shipping</h2>
            <p className="text-xs text-gray-500 mb-3">
                Used to declare the parcel to the courier. Leave blank and consignments are
                booked at an estimated 0.5&nbsp;kg, which can attract a weight discrepancy charge.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Weight (per unit)
                    </label>
                    <input
                        type="number"
                        name="shippingWeight"
                        value={shipping.weight ?? ""}
                        onChange={onField("weight")}
                        min="0"
                        step="0.001"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                        placeholder="e.g. 2.4"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Weight Unit</label>
                    <AnimatedSelect
                        name="shippingWeightUnit"
                        value={shipping.weightUnit || "kg"}
                        onChange={onField("weightUnit")}
                        options={[
                            { value: "kg", label: "Kilograms (kg)" },
                            { value: "g", label: "Grams (g)" },
                        ]}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                {["length", "width", "height"].map((axis) => (
                    <div key={axis}>
                        <label className="block text-xs font-semibold text-gray-700 mb-1 capitalize">
                            {axis}
                        </label>
                        <input
                            type="number"
                            name={`shipping${axis}`}
                            value={shipping[axis] ?? ""}
                            onChange={onField(axis)}
                            min="0"
                            step="0.1"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            placeholder="0"
                        />
                    </div>
                ))}

                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Unit</label>
                    <AnimatedSelect
                        name="shippingDimensionUnit"
                        value={shipping.dimensionUnit || "cm"}
                        onChange={onField("dimensionUnit")}
                        options={[
                            { value: "cm", label: "Centimetres" },
                            { value: "in", label: "Inches" },
                        ]}
                    />
                </div>
            </div>

            {metrics.hasAny && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5">
                    <p className="text-sm text-blue-900">
                        Chargeable weight:{" "}
                        <strong className="font-bold">{metrics.chargeable} kg</strong>
                        <span className="text-blue-700">
                            {" "}— actual {metrics.actual} kg, volumetric {metrics.volumetric} kg
                        </span>
                    </p>
                    <p className="text-xs text-blue-700 mt-0.5">
                        {metrics.basis === "volumetric"
                            ? "This parcel is bulky for its weight, so the courier bills on volume."
                            : "The courier bills on actual weight for this parcel."}
                    </p>
                </div>
            )}

            {!metrics.hasAny && (
                <p className="mt-3 text-xs text-amber-700">
                    No shipping details yet — consignments for this product will be estimated.
                </p>
            )}
        </div>
    );
};

export default ShippingSection;

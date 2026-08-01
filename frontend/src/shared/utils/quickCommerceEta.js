/**
 * Quick Commerce ETA — PREVIEW MIRROR.
 *
 * ⚠️  Display only. The authoritative implementation is
 *     `backend/src/services/quickCommerce.service.js → calculateEta`, and the
 *     ETA a customer is actually promised is computed and persisted at checkout.
 *
 * Both are executed against the shared fixture
 * (`backend/src/services/quickCommerceEta.fixtures.js`); if you change the rule
 * here, change it there too or the parity harness fails.
 *
 *     ETA = preparationTime (+ busy padding) + travelTime
 */

export const DEFAULT_AVERAGE_SPEED_KMPH = 20;
export const DEFAULT_PREPARATION_MINS = 10;

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export const haversineDistanceKm = (from, to) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const lat1 = Number(from?.latitude);
  const lng1 = Number(from?.longitude);
  const lat2 = Number(to?.latitude);
  const lng2 = Number(to?.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return Number((2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))).toFixed(3));
};

/**
 * Preview ETA. Mirrors the server implementation exactly.
 * @returns {{ etaMinutes: number, prepMins: number, travelMins: number }}
 */
export const calculateEta = ({
  preparationTimeMins,
  extraPrepMins = 0,
  distanceKm,
  averageSpeedKmph = DEFAULT_AVERAGE_SPEED_KMPH,
}) => {
  const basePrep = Number(preparationTimeMins);
  const prepMins =
    Math.max(0, Number.isFinite(basePrep) ? basePrep : DEFAULT_PREPARATION_MINS) +
    Math.max(0, Number(extraPrepMins) || 0);

  const speed =
    Number(averageSpeedKmph) > 0 ? Number(averageSpeedKmph) : DEFAULT_AVERAGE_SPEED_KMPH;
  const distance = Number(distanceKm);
  const travelMins =
    Number.isFinite(distance) && distance > 0 ? Math.ceil((distance / speed) * 60) : 0;

  return {
    etaMinutes: Math.max(1, Math.round(prepMins + travelMins)),
    prepMins: Math.round(prepMins),
    travelMins,
  };
};

/** Human-readable ETA window, e.g. "16–26 min". */
export const formatEtaRange = (etaMinutes, spreadMins = 10) => {
  const eta = Number(etaMinutes);
  if (!Number.isFinite(eta) || eta <= 0) return null;
  return `${eta}–${eta + Math.max(0, spreadMins)} min`;
};

export default calculateEta;

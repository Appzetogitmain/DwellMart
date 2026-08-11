import { useEffect, useRef, useState } from "react";
import { FiMapPin } from "react-icons/fi";
import { hasGoogleMapsKey, loadGoogleMaps } from "./googleMaps";

const INDIA_CENTER = { latitude: 20.5937, longitude: 78.9629 };
const toPoint = (value) => {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
};

/** A self-contained pin picker. It never persists a location by itself. */
const GoogleMapPicker = ({ value, onChange, height = 240, className = "" }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const listenerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState(hasGoogleMapsKey() ? "loading" : "unavailable");
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const selected = toPoint(value) || INDIA_CENTER;
      const map = new maps.Map(containerRef.current, {
        center: { lat: selected.latitude, lng: selected.longitude },
        zoom: toPoint(value) ? 15 : 5,
        clickableIcons: false,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
      });
      mapRef.current = map;
      const setMarker = (point) => {
        if (!markerRef.current) {
          markerRef.current = new maps.Marker({ map, position: point, draggable: true });
          markerRef.current.addListener("dragend", (event) => onChangeRef.current?.({
            latitude: event.latLng.lat(), longitude: event.latLng.lng(),
          }));
        } else markerRef.current.setPosition(point);
      };
      if (toPoint(value)) setMarker({ lat: selected.latitude, lng: selected.longitude });
      listenerRef.current = map.addListener("click", (event) => {
        const point = { latitude: event.latLng.lat(), longitude: event.latLng.lng() };
        setMarker({ lat: point.latitude, lng: point.longitude });
        onChangeRef.current?.(point);
      });
      setStatus("ready");
    }).catch(() => !cancelled && setStatus("unavailable"));

    return () => {
      cancelled = true;
      listenerRef.current?.remove?.();
    };
    // The map is created once; the next effect updates its pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const point = toPoint(value);
    if (!point || !mapRef.current || !window.google?.maps) return;
    const mapPoint = { lat: point.latitude, lng: point.longitude };
    mapRef.current.panTo(mapPoint);
    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({ map: mapRef.current, position: mapPoint, draggable: true });
      markerRef.current.addListener("dragend", (event) => onChangeRef.current?.({
        latitude: event.latLng.lat(), longitude: event.latLng.lng(),
      }));
    } else markerRef.current.setPosition(mapPoint);
  }, [value?.latitude, value?.longitude]);

  if (status === "unavailable") {
    return (
      <div className={"rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 " + className}>
        <FiMapPin className="mb-1" /> Map pinning is unavailable. You can still use GPS or enter coordinates manually.
      </div>
    );
  }

  return (
    <div className={"relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100 " + className} style={{ height }}>
      <div ref={containerRef} className="h-full w-full" aria-label="Select a location on the map" />
      {status === "loading" && <div className="absolute inset-0 grid place-items-center text-sm text-gray-600">Loading map…</div>}
      {status === "ready" && <p className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs text-gray-700 shadow">Tap or drag the pin to set the exact location.</p>}
    </div>
  );
};

export default GoogleMapPicker;

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { theme } from 'antd';
import { LEAFLET_CSS } from './leafletCss';

/**
 * Interactive Leaflet map (OpenStreetMap raster tiles — NO API key). Used both in the editable
 * Location widget (pick a point by clicking / dragging the pin) and in the display widget (view).
 *
 * - Leaflet's CSS is injected ONCE via a <style> tag (bundled as a string) so it doesn't depend on
 *   the build pipeline handling CSS imports.
 * - The marker is a CSS DivIcon (no image files → nothing to bundle / no broken marker-icon.png).
 */

let _cssInjected = false;
function ensureCss() {
  if (_cssInjected || typeof document === 'undefined') return;
  try {
    const style = document.createElement('style');
    style.setAttribute('data-ptdl-leaflet', '1');
    style.textContent = LEAFLET_CSS;
    document.head.appendChild(style);
    _cssInjected = true;
  } catch (_) { /* ignore */ }
}

const PIN_HTML =
  '<div style="width:22px;height:22px;transform:translateY(-4px)">' +
  '<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:#f5222d;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-45deg);margin:3px auto"></div>' +
  '</div>';

function pinIcon() {
  return L.divIcon({ html: PIN_HTML, className: 'ptdl-pin', iconSize: [22, 26], iconAnchor: [11, 22] });
}

export interface PickMapProps {
  lat?: number;
  lng?: number;
  height?: number;
  zoom?: number;
  /** allow the user to move the pin by clicking / dragging (editable mode) */
  editable?: boolean;
  onPick?: (lat: number, lng: number) => void;
}

export const PickMap: React.FC<PickMapProps> = ({ lat, lng, height = 220, zoom = 16, editable = false, onPick }) => {
  const { token } = theme.useToken();
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Init once.
  useEffect(() => {
    ensureCss();
    if (!elRef.current || mapRef.current) return;
    const hasFix = lat != null && lng != null;
    const center: [number, number] = hasFix ? [lat as number, lng as number] : [16.047079, 108.20623]; // Đà Nẵng fallback
    let map: any;
    try {
      map = L.map(elRef.current, { center, zoom: hasFix ? zoom : 5, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      mapRef.current = map;

      if (hasFix) {
        markerRef.current = L.marker(center, { icon: pinIcon(), draggable: editable }).addTo(map);
        if (editable) {
          markerRef.current.on('dragend', (e: any) => {
            const p = e.target.getLatLng();
            onPickRef.current?.(round6(p.lat), round6(p.lng));
          });
        }
      }
      if (editable) {
        map.on('click', (e: any) => {
          const { lat: la, lng: ln } = e.latlng;
          onPickRef.current?.(round6(la), round6(ln));
        });
      }
      // Container may mount hidden (modal/tab) → recompute size shortly after.
      setTimeout(() => { try { map.invalidateSize(); } catch (_) { /* ignore */ } }, 120);
    } catch (_) { /* ignore */ }

    return () => {
      try { map?.remove(); } catch (_) { /* ignore */ }
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external value changes (GPS button, manual entry) onto the map + marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) return;
    const ll: [number, number] = [lat, lng];
    try {
      map.setView(ll, Math.max(map.getZoom() || 0, zoom));
      if (markerRef.current) {
        markerRef.current.setLatLng(ll);
      } else {
        markerRef.current = L.marker(ll, { icon: pinIcon(), draggable: editable }).addTo(map);
        if (editable) {
          markerRef.current.on('dragend', (e: any) => {
            const p = e.target.getLatLng();
            onPickRef.current?.(round6(p.lat), round6(p.lng));
          });
        }
      }
    } catch (_) { /* ignore */ }
  }, [lat, lng, editable, zoom]);

  return (
    <div
      ref={elRef}
      style={{ width: '100%', height, borderRadius: 8, overflow: 'hidden', border: `1px solid ${token.colorBorder}` }}
    />
  );
};

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

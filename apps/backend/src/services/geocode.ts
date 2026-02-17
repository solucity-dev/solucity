//apps/backend/src/services/geocode.ts
import fetch from 'node-fetch';

export type GeocodeResult = {
  formatted: string;
  lat: number;
  lng: number;
  placeId?: string | null;
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Acá fijamos ciudad base para el MVP
const DEFAULT_CONTEXT = 'Córdoba, Argentina';

export async function geocodeAddress(rawAddress: string): Promise<GeocodeResult | null> {
  const q = rawAddress.trim();
  if (!q) return null;

  // ✅ si el usuario no escribió ciudad/provincia, se la agregamos
  const query = /c[oó]rdoba|argentina/i.test(q) ? q : `${q}, ${DEFAULT_CONTEXT}`;

  const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&addressdetails=1&countrycodes=ar&q=${encodeURIComponent(query)}`;

  const r = await fetch(url, {
    headers: {
      // Nominatim exige un User-Agent identificable
      'User-Agent': 'solucity-backend/1.0 (contacto@solucity.app)',
      'Accept-Language': 'es',
    },
  });

  if (!r.ok) return null;
  const data: any[] = await r.json();
  const hit = data?.[0];
  if (!hit) return null;

  // ✅ filtro extra: solo aceptamos resultados dentro de la provincia de Córdoba
  const state =
    hit.address?.state ||
    hit.address?.region ||
    hit.address?.state_district ||
    hit.address?.ISO3166_2_lvl4 ||
    hit.address?.county ||
    '';

  if (!/c[oó]rdoba/i.test(String(state))) {
    return null;
  }

  return {
    formatted: hit.display_name,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    placeId: hit.place_id ? String(hit.place_id) : null,
  };
}

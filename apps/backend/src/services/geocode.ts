//apps/backend/src/services/geocode.ts
// apps/backend/src/services/geocode.ts
import fetch from 'node-fetch';

export type GeocodeResult = {
  formatted: string;
  lat: number;
  lng: number;
  placeId?: string | null;
};

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Contexto base para búsquedas incompletas
const DEFAULT_CONTEXT = 'Córdoba, Argentina';

// Activá con DEBUG_GEOCODE=1 en Render/local si querés ver trazas
const debugGeocode = process.env.DEBUG_GEOCODE === '1';

function logGeocode(label: string, payload?: Record<string, unknown>) {
  if (!debugGeocode) return;
  console.log(`[geocode] ${label}`, payload ?? {});
}

function isCordobaText(value: unknown) {
  return /c[oó]rdoba/i.test(String(value ?? ''));
}

function isCordobaResult(hit: any) {
  const fields = [
    hit?.address?.state,
    hit?.address?.region,
    hit?.address?.state_district,
    hit?.address?.county,
    hit?.address?.province,
    hit?.address?.ISO3166_2_lvl4,
    hit?.display_name,
  ]
    .filter(Boolean)
    .map((v) => String(v));

  return fields.some((value) => isCordobaText(value));
}

function isValidLatLng(hit: any) {
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  return !Number.isNaN(lat) && !Number.isNaN(lng);
}

export async function geocodeAddress(rawAddress: string): Promise<GeocodeResult | null> {
  const q = String(rawAddress ?? '').trim();
  if (!q) return null;

  // Si no menciona Córdoba/Argentina, completamos contexto
  const query = /c[oó]rdoba|argentina/i.test(q) ? q : `${q}, ${DEFAULT_CONTEXT}`;

  const url =
    `${NOMINATIM_URL}?format=jsonv2&limit=5&addressdetails=1&countrycodes=ar&q=` +
    encodeURIComponent(query);

  logGeocode('request', { rawAddress: q, query, url });

  const r = await fetch(url, {
    headers: {
      // Nominatim exige un User-Agent identificable
      'User-Agent': 'solucity-backend/1.0 (contacto@solucity.app)',
      'Accept-Language': 'es',
    },
  });

  logGeocode('response_status', { ok: r.ok, status: r.status });

  if (!r.ok) return null;

  const data: any[] = await r.json();

  logGeocode('raw_results', {
    count: Array.isArray(data) ? data.length : 0,
    sample: Array.isArray(data)
      ? data.slice(0, 5).map((hit) => ({
          display_name: hit?.display_name ?? null,
          lat: hit?.lat ?? null,
          lon: hit?.lon ?? null,
          state: hit?.address?.state ?? null,
          region: hit?.address?.region ?? null,
          county: hit?.address?.county ?? null,
          state_district: hit?.address?.state_district ?? null,
          province: hit?.address?.province ?? null,
          ISO3166_2_lvl4: hit?.address?.ISO3166_2_lvl4 ?? null,
        }))
      : [],
  });

  if (!Array.isArray(data) || data.length === 0) {
    logGeocode('no_results');
    return null;
  }

  // 1) Preferimos primer hit válido dentro de Córdoba
  const validCordobaHit = data.find((hit) => isValidLatLng(hit) && isCordobaResult(hit));

  if (validCordobaHit) {
    const result = {
      formatted: String(validCordobaHit.display_name ?? '').trim(),
      lat: Number(validCordobaHit.lat),
      lng: Number(validCordobaHit.lon),
      placeId: validCordobaHit.place_id ? String(validCordobaHit.place_id) : null,
    };

    logGeocode('selected_cordoba_hit', result);
    return result;
  }

  // 2) Si no encontramos Córdoba explícito, no aceptamos nada
  //    para no romper la restricción geográfica actual.
  logGeocode('no_valid_cordoba_hit', {
    rawAddress: q,
    query,
    candidatesChecked: data.length,
  });

  return null;
}

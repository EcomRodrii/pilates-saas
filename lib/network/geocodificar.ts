// Geocodificación de dirección aproximada (ciudad + zona) a lat/lng real,
// vía Nominatim (OpenStreetMap) — gratuito, sin API key. SERVER-ONLY: nunca
// se importa desde un componente cliente ni se expone directo a un endpoint
// público sin control de tasa (ver app/api/interno/network/
// geocodificar-backfill/route.ts, protegido igual que el resto de /interno).
//
// Mismo criterio "mejor esfuerzo, nunca inventa" que ya sigue
// coordsDeCiudad (lib/network/ciudades-coords.ts): si Nominatim no
// encuentra nada, o la petición falla, se devuelve `null` — jamás una
// posición aproximada o inventada.
//
// Política de uso de Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
// máximo 1 petición por segundo y SIEMPRE una cabecera User-Agent que
// identifique la app. Esta función hace UNA petición por llamada — el
// límite de frecuencia lo respeta quien la invoca en bucle (el backfill,
// que espera >=1100ms entre llamadas); no se pone rate-limit aquí dentro
// porque una única geocodificación al guardar el perfil (PUT /api/network/
// perfil) nunca se dispara en ráfaga por definición del propio endpoint.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// hola@tentare.es es el mismo remitente ya usado en el resto del repo
// (lib/emails/remitente.ts) — un contacto real, no un placeholder inventado.
const USER_AGENT = 'Tentare/1.0 (hola@tentare.es)';

interface RespuestaNominatim {
  lat: string;
  lon: string;
}

/**
 * Geocodifica una ciudad (+ zona opcional) española a coordenadas reales.
 * Devuelve `null` si Nominatim no encuentra nada o si la petición falla —
 * nunca inventa una posición.
 */
export async function geocodificarDireccion(
  ciudad: string, zona?: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const ciudadLimpia = ciudad.trim();
  if (!ciudadLimpia) return null;

  // "Zona, Ciudad, España" da mejores resultados que solo la ciudad cuando
  // hay barrio/zona (Nominatim prioriza el término más específico primero,
  // igual que buscarías tú a mano); sin zona, cae a "Ciudad, España".
  const zonaLimpia = zona?.trim();
  const q = zonaLimpia ? `${zonaLimpia}, ${ciudadLimpia}, España` : `${ciudadLimpia}, España`;

  const params = new URLSearchParams({ q, format: 'json', limit: '1' });

  let respuesta: Response;
  try {
    respuesta = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
  } catch {
    // Red caída, timeout, etc. — mejor esfuerzo, no se reintenta aquí.
    return null;
  }
  if (!respuesta.ok) return null;

  const datos = (await respuesta.json().catch(() => null)) as RespuestaNominatim[] | null;
  if (!datos || datos.length === 0) return null;

  const lat = Number(datos[0].lat);
  const lng = Number(datos[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

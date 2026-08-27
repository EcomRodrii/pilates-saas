// "Búsquedas recientes" del overlay BUSCAR — historial REAL guardado en este
// dispositivo, nunca los ejemplos fijos de la maqueta ("reformer hoy" /
// "marta" / "prenatal" del diseño original). Sin historial, la sección
// entera no se pinta (ver components/portal/buscar-overlay.tsx) — mismo
// principio que el resto del portal: un hueco vacío no se rellena con datos
// de mentira.
//
// Lógica pura (sin React), mismo criterio que lib/portal-bienvenida.ts:
// testeable sin DOM, y el componente solo la envuelve.

const PREFIJO = 'pilates:portal-busqueda-reciente:';
const MAXIMO = 6;

export function claveBusquedaReciente(slug: string): string {
  return `${PREFIJO}${slug}`;
}

/** Últimas búsquedas de ESTE estudio en ESTE dispositivo, más reciente primero. */
export function obtenerBusquedasRecientes(slug: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(claveBusquedaReciente(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, MAXIMO);
  } catch {
    // Storage bloqueado (modo privado, cuota) o JSON corrupto — sin
    // historial es un estado válido, no un error que bloquee la búsqueda.
    return [];
  }
}

/**
 * Guarda una búsqueda, más reciente primero. Deduplica sin distinguir
 * mayúsculas/acentos de capitalización simple (misma query escrita dos
 * veces no ocupa dos huecos) conservando la SEGUNDA vez tal y como se
 * escribió, que es la más reciente.
 */
export function guardarBusquedaReciente(slug: string, query: string): void {
  const limpia = query.trim();
  if (!limpia) return;
  try {
    const actuales = obtenerBusquedasRecientes(slug);
    const sinDuplicado = actuales.filter(q => q.toLowerCase() !== limpia.toLowerCase());
    const siguiente = [limpia, ...sinDuplicado].slice(0, MAXIMO);
    window.localStorage.setItem(claveBusquedaReciente(slug), JSON.stringify(siguiente));
  } catch {
    /* ignore — no bloquear la búsqueda porque el storage esté lleno/bloqueado */
  }
}

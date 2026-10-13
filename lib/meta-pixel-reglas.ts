// ─────────────────────────────────────────────────────────────────────────────
// Meta Pixel — las REGLAS (dónde, quién y con qué permiso), sin navegador ni red,
// para poder probarlas con `node --test`. El envío vive en meta-pixel-cliente.ts.
//
// ⚠️ **El píxel mide la web comercial y el alta, y NADA más.** Esta app sirve la
// landing, el panel, el portal de las alumnas y el widget de reservas desde UN
// solo root layout (mismo motivo que lib/ahrefs-cliente.ts). Aquí la puerta es
// una LISTA BLANCA y no `esNoIndexable()`: `/reservar/<slug>` es indexable, pero
// es la página de un estudio cliente y sus visitantes no son tráfico de Tentare.
//
// ⚠️ **Solo con consentimiento.** `_fbp` es una cookie de publicidad: la LSSI
// exige el sí ANTES de cargar `fbevents.js`, y la política de cookies prometía
// no usarlas. Sin decisión no se carga nada; un «no» se respeta 180 días.
// ─────────────────────────────────────────────────────────────────────────────

/** ID del dataset «Tentare Web» (Business Manager de Tentare). Es público. */
export const PIXEL_ID = '1082790444609431';

/** Etiqueta de verificación de dominio de Meta para tentare.app. También pública. */
export const VERIFICACION_DOMINIO_META = 'dkpvfvz9blahj4ejn42gmyt0vr8uc0';

export const CLAVE_DECISION = 'tentare-cookies-publicidad';
export const EVENTO_DECISION = 'tentare:cookies-publicidad';

const CADUCA_MS = 180 * 24 * 60 * 60 * 1000;

/** Solo producción: previews y `npm run dev` no ensucian los datos de la campaña. */
const HOSTS_CON_PIXEL = ['tentare.app', 'www.tentare.app'];

const PREFIJOS_CON_PIXEL = [
  '/funcionalidades', '/precios', '/comparativa', '/soluciones', '/recursos', '/glosario',
  '/crear-estudio',
];

export type Decision = 'si' | 'no';

export function hostConPixel(host: string): boolean {
  return HOSTS_CON_PIXEL.includes(host.toLowerCase());
}

/** ¿Esta ruta es de las que se miden? Prefijo de SEGMENTO: `/precios-x` no entra. */
export function rutaConPixel(path: string): boolean {
  if (path === '/') return true;
  return PREFIJOS_CON_PIXEL.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Lo que se guarda: la decisión y cuándo, para volver a preguntar a los 180 días. */
export function codificarDecision(d: Decision, ahora: number): string {
  return JSON.stringify({ d, t: ahora });
}

/** `null` = sin decisión (nunca se preguntó, caducó o el dato está roto). */
export function leerDecision(raw: string | null, ahora: number): Decision | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { d?: unknown; t?: unknown };
    if (v.d !== 'si' && v.d !== 'no') return null;
    if (typeof v.t !== 'number' || ahora - v.t > CADUCA_MS || v.t > ahora) return null;
    return v.d;
  } catch {
    return null;
  }
}

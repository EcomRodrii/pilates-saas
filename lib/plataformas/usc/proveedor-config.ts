// El ID de proveedor y el de ubicación de USC de cada estudio, y lo que hay que
// comprobar antes de guardarlos. Sin `server-only` a propósito: las
// dependencias (base de datos, USC) entran por `deps`, así que esto se prueba
// con `node --test` sin tocar red ni base de datos.
//
// Reglas:
//  · Un proveedor (y una ubicación) pertenece a UN estudio. Si el ID ya lo
//    tiene otro, el rechazo es el mismo mensaje neutro que cuando USC no
//    reconoce los IDs: no sirve para saber de quién es cada ID.
//  · Con credenciales de integrador, se comprueba contra `GET /locations` que
//    el proveedor existe y que la ubicación es suya y está activa.
//  · Sin credenciales no se puede comprobar: se guarda (el estudio no pierde lo
//    que escribió) pero NO verificado, y el cron no publica nada ni toca USC
//    con esos IDs hasta que se verifiquen (basta volver a guardar con
//    credenciales presentes).
//  · «Verificado» lo escribe SOLO el servidor, en `verificadoPar`, ligado al par
//    exacto proveedor/ubicación: cambiar un ID por cualquier camino invalida la
//    marca sola. Lo que venga del navegador con ese nombre se descarta.
import type { CredencialesUsc, ResultadoUsc, UbicacionUsc } from './cliente.ts';

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MENSAJE_IDS_USC_NO_VALIDOS =
  'No hemos podido conectar con esos IDs de Urban Sports Club. Revísalos con ellos o escríbenos.';
const MENSAJE_FORMATO = 'Los dos IDs tienen este formato: 8-4-4-4-12 letras y números, separados por guiones.';
const MENSAJE_SIN_COMPROBAR = 'No hemos podido comprobar los IDs con Urban Sports Club ahora mismo. No hemos cambiado nada: inténtalo de nuevo en un momento.';

const texto = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/** El par proveedor/ubicación ya normalizado, o null si falta alguno o no es un UUID. */
export function parUsc(config: unknown): { providerId: string; locationId: string } | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const providerId = texto(c.providerId);
  const locationId = texto(c.locationId);
  return RE_UUID.test(providerId) && RE_UUID.test(locationId) ? { providerId, locationId } : null;
}

const marcaDe = (p: { providerId: string; locationId: string }) => `${p.providerId}/${p.locationId}`;

/** ¿USC reconoció este par al guardarlo? Falso para todo lo guardado antes de existir la marca. */
export function uscVerificada(config: unknown): boolean {
  const p = parUsc(config);
  return !!p && texto((config as Record<string, unknown>).verificadoPar) === marcaDe(p);
}

export interface DepsConfigUsc {
  credenciales: () => CredencialesUsc | null;
  ubicaciones: (c: CredencialesUsc, providerId: string) => Promise<ResultadoUsc<UbicacionUsc[]>>;
  /** ¿Lo tiene ya OTRO estudio? Lanza si no puede saberlo. */
  ocupado: (providerId: string, locationId: string) => Promise<boolean>;
}

export type ResultadoConfigUsc =
  | { ok: true; config: Record<string, string>; verificada: boolean }
  | { ok: false; status: 400 | 409 | 503; error: string };

export async function prepararConfigUsc(args: {
  enviada: Record<string, string>;
  guardada: Record<string, string>;
  deps: DepsConfigUsc;
}): Promise<ResultadoConfigUsc> {
  const { enviada, guardada, deps } = args;
  const config: Record<string, string> = { ...enviada };
  delete config.verificadoPar;

  const hayAlgunId = texto(enviada.providerId) !== '' || texto(enviada.locationId) !== '';
  if (!hayAlgunId) return { ok: true, config, verificada: false };

  const par = parUsc(enviada);
  if (!par) return { ok: false, status: 400, error: MENSAJE_FORMATO };
  config.providerId = par.providerId;
  config.locationId = par.locationId;

  // El mismo par que ya tenía Y ya verificado (p. ej. el interruptor «Vendo
  // aquí» reenvía la config entera): nada que volver a comprobar. Si estaba sin
  // verificar, sigue adelante: con credenciales presentes, volver a guardar lo verifica.
  const previo = parUsc(guardada);
  if (previo && marcaDe(previo) === marcaDe(par) && uscVerificada(guardada)) {
    config.verificadoPar = marcaDe(par);
    return { ok: true, config, verificada: true };
  }

  try {
    if (await deps.ocupado(par.providerId, par.locationId)) {
      return { ok: false, status: 409, error: MENSAJE_IDS_USC_NO_VALIDOS };
    }
    const cred = deps.credenciales();
    if (!cred) return { ok: true, config, verificada: false };
    const r = await deps.ubicaciones(cred, par.providerId);
    if (!r.ok) {
      // 400/404/422: USC no conoce ese proveedor. Lo demás (401/403/429, 5xx, red) es no poder saberlo.
      return /^USC (400|404|422)\b/.test(r.error) || r.error === 'providerId no válido'
        ? { ok: false, status: 409, error: MENSAJE_IDS_USC_NO_VALIDOS }
        : { ok: false, status: 503, error: MENSAJE_SIN_COMPROBAR };
    }
    if (!r.valor.some(u => u.id === par.locationId && u.estado === 'Active')) {
      return { ok: false, status: 409, error: MENSAJE_IDS_USC_NO_VALIDOS };
    }
  } catch {
    return { ok: false, status: 503, error: MENSAJE_SIN_COMPROBAR };
  }
  config.verificadoPar = marcaDe(par);
  return { ok: true, config, verificada: true };
}

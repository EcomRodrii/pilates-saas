import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Un doble toque en «Canjear» es UN canje.
//
// La pantalla genera una clave al empezar la acción y la reutiliza en cada
// reintento hasta que el servidor contesta. El servidor la convierte en el id
// del canje (determinista, atado a estudio + alumna + recompensa): el segundo
// intento choca con la PK de `reward_redemptions`, la transacción de
// `canjear_recompensa` se deshace entera y se contesta con el canje que ya
// existe. Nada de leer-y-luego-escribir: la unicidad la da la base.
//
// Sin `server-only` a propósito: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

/** Forma admitida de la clave que manda la pantalla (la genera ella, no el usuario). */
export const CLAVE_CANJE_RE = /^[A-Za-z0-9_-]{8,80}$/;

export function claveCanjeValida(clave: unknown): clave is string {
  return typeof clave === 'string' && CLAVE_CANJE_RE.test(clave);
}

/**
 * Id del canje para una clave. Incluye estudio, alumna y recompensa: la misma
 * clave en otra recompensa, u otra alumna, no puede colisionar con este canje.
 */
export function idCanjeDeClave(p: { studioId: string; socioId: string; catalogItemId: string; clave: string }): string {
  const h = createHash('sha256')
    // JSON y no un separador: con `|` un id con ese carácter movía texto de un
    // campo al siguiente y construía la misma cadena desde otra combinación.
    .update(JSON.stringify([p.studioId, p.socioId, p.catalogItemId, p.clave]))
    .digest('hex');
  return `rwd-${h.slice(0, 32)}`;
}

/** `23505` = unique_violation: el id del canje (o su código) ya existía. */
export function esViolacionUnica(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === '23505' || /duplicate key|unique constraint/i.test(error.message ?? '')));
}

export type ResultadoClaseGratis = 'ENTREGADO' | 'TOPE' | 'NO_PENDIENTE';

export function leerResultadoClaseGratis(data: unknown): ResultadoClaseGratis | null {
  return data === 'ENTREGADO' || data === 'TOPE' || data === 'NO_PENDIENTE' ? data : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A-3 (auditoría 20-ago): el JWT caducado dejaba el panel «vacío».
//
// Una pestaña dormida despierta con el access token caducado. El autorefresh
// del SDK lo renueva solo unos segundos después, pero las consultas que ya
// fallaron con PGRST303 devolvieron `[]` UNA vez y nada las reintenta: si el
// fallo pilló a `resolveStudioId` en el arranque, la propietaria ve su estudio
// entero vacío sin ninguna explicación (8 issues en Sentry, 36 eventos, 1
// usuaria real). La recuperación: refrescar la sesión y recargar — con las
// guardas de este módulo, que es puro a propósito (sin imports con alias) para
// poder fijar la tabla de decisión con tests de node --test.
// ─────────────────────────────────────────────────────────────────────────────

/** ¿Este error de PostgREST/Supabase es «el token de la sesión caducó»? */
export function esJwtCaducado(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : '';
  const msg =
    typeof e.message === 'string' ? e.message
    : error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : '';
  return code === 'PGRST303' || /\bjwt expired\b/i.test(msg);
}

export type DecisionRecuperacionJwt = 'recargar' | 'login' | 'nada';

// Si la última recarga por este motivo fue hace menos de esto y el token
// vuelve a caducar, refrescar «funciona» pero las consultas siguen muriendo:
// algo más está roto (reloj del cliente, proyecto caído) y recargar en bucle
// solo lo escondería. Se corta hacia /login, que es visible y accionable.
export const VENTANA_ANTIBUCLE_MS = 5 * 60_000;

/**
 * Qué hacer cuando una consulta muere por JWT caducado.
 *
 *  · Sin sesión local de staff no hay nada que recuperar — y sobre todo, NUNCA
 *    se manda a /login a una visitante de una página pública.
 *  · Refresh fallido = el refresh token también murió (sesión revocada o
 *    agotada): a /login con motivo, en vez de un panel vacío que no explica.
 *  · Refresh OK = la sesión vive; recargar deja el panel como si nada… salvo
 *    que ya recargáramos hace nada (ver VENTANA_ANTIBUCLE_MS).
 */
export function decidirRecuperacionJwt(p: {
  haySesionLocal: boolean;
  refreshOk: boolean;
  ultimaRecargaMs: number | null;
  ahoraMs: number;
}): DecisionRecuperacionJwt {
  if (!p.haySesionLocal) return 'nada';
  if (!p.refreshOk) return 'login';
  if (p.ultimaRecargaMs !== null && p.ahoraMs - p.ultimaRecargaMs < VENTANA_ANTIBUCLE_MS) {
    return 'login';
  }
  return 'recargar';
}

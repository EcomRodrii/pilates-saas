// ─────────────────────────────────────────────────────────────────────────────
// Un access token vigente de la cuenta de SumUp del estudio (sin red ni base de
// datos: todo inyectado, para probar las carreras con node --test). El cableado de
// verdad está en sumup-oauth.ts (`tokenSumup`).
//
// ⚠️ SumUp ROTA el refresh token en cada renovación, y renuevan a la vez el sondeo
// de la Caja, el aviso de SumUp y el barrido. Si dos renuevan con el mismo token,
// el segundo recibe `invalid_grant`. Por eso: se guarda solo si nadie lo cambió
// entre medias (versión leída), y quien pierde relee y usa el token del que ganó.
// `invalid_grant` solo significa «hay que volver a conectar» si el guardado sigue
// siendo el que usamos. Las credenciales nunca se borran solas.
// ─────────────────────────────────────────────────────────────────────────────

export type TokensSumup = { accessToken: string; refreshToken: string; expiresAt: string };

export type ResultadoRenovacion =
  | { ok: true; tokens: TokensSumup }
  | { ok: false; invalidGrant: boolean; error: string };

export interface CredencialesTokenSumup extends TokensSumup {
  merchantCode: string;
  /** Versión de la fila al leerla (`actualizado_en`). */
  version: string | null;
}

export type TokenSumup =
  | { ok: true; token: string; merchantCode: string }
  /** `reconectar`: el permiso ya no vale; la dueña tiene que volver a conectar la cuenta. */
  | { ok: false; motivo: 'sin-conectar' | 'reconectar' | 'no-disponible' };

export interface DepsTokenSumup {
  leer: (studioId: string) => Promise<CredencialesTokenSumup | null>;
  /** Guarda solo si la fila sigue en `versionLeida`. `false` = otro proceso ganó. */
  guardarRenovado: (studioId: string, t: TokensSumup, versionLeida: string) => Promise<boolean>;
  renovarEnSumup: (refreshToken: string) => Promise<ResultadoRenovacion>;
  ahora: () => number;
}

/** Margen antes de que caduque: no se usa un token al que le queda menos de un minuto. */
const MARGEN_MS = 60_000;

/**
 * Nunca lanza: un fallo de red o de SumUp es `no-disponible` (quien pregunta por un
 * cobro lo trata como «todavía no se sabe», nunca como fallido).
 */
export async function obtenerTokenSumup(studioId: string, d: DepsTokenSumup): Promise<TokenSumup> {
  try {
    const creds = await d.leer(studioId);
    if (!creds) return { ok: false, motivo: 'sin-conectar' };
    if (new Date(creds.expiresAt).getTime() - MARGEN_MS > d.ahora()) {
      return { ok: true, token: creds.accessToken, merchantCode: creds.merchantCode };
    }
    const r = await d.renovarEnSumup(creds.refreshToken);
    if (r.ok) {
      if (creds.version && await d.guardarRenovado(studioId, r.tokens, creds.version)) {
        return { ok: true, token: r.tokens.accessToken, merchantCode: creds.merchantCode };
      }
      // Otro proceso renovó antes: su token es el bueno (el que acabamos de pedir
      // puede quedar invalidado por la rotación). Releer y usar el suyo.
      return await releer(studioId, creds, d);
    }
    if (r.invalidGrant) {
      // ¿Lo invalidó otro renovando a la vez? Entonces hay uno nuevo guardado.
      const tras = await releer(studioId, creds, d);
      return tras.ok ? tras : { ok: false, motivo: 'reconectar' };
    }
    console.error('[sumup:renovar]', r.error);
    return { ok: false, motivo: 'no-disponible' };
  } catch (e) {
    console.error('[sumup:token]', e instanceof Error ? e.message : e);
    return { ok: false, motivo: 'no-disponible' };
  }
}

async function releer(studioId: string, antes: CredencialesTokenSumup, d: DepsTokenSumup): Promise<TokenSumup> {
  const ahora = await d.leer(studioId);
  if (ahora && ahora.version !== antes.version && new Date(ahora.expiresAt).getTime() - MARGEN_MS > d.ahora()) {
    return { ok: true, token: ahora.accessToken, merchantCode: ahora.merchantCode };
  }
  return { ok: false, motivo: 'no-disponible' };
}

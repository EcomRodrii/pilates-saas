// El enlace de invitación de una instructora, guardado en la app mientras entra.
//
// El correo de invitación lleva a la app del estudio; ella puede entrar con
// Google o pidiendo un enlace a su correo, y ese enlace se abre en OTRA pestaña.
// Por eso se guarda en `localStorage` y no en `sessionStorage`.
//
// ⚠️ En un móvil o un ordenador compartido, ese enlace no puede quedarse
// esperando a la siguiente persona que entre (vale con cualquier cuenta y da
// acceso de instructora). Por eso:
//   · caduca en 24 h;
//   · se ata a la PRIMERA cuenta que lo usa: si entra otra, se descarta;
//   · se borra al cerrar sesión (`useAuthStudent().logout`);
//   · y nada se une solo: hay que pulsar «Como instructora» (`/acceso/elegir`).
//
// Puro, sin navegador, para poder probarlo con `node --test`.

export const VIGENCIA_INVITACION_MS = 24 * 60 * 60_000;

/** Forma de un token firmado (`payload.firma`, base64url). Lo valida el servidor. */
const FORMA_TOKEN = /^[A-Za-z0-9_-]{8,1500}\.[A-Za-z0-9_-]{8,200}$/;

export function tokenConForma(token: unknown): token is string {
  return typeof token === 'string' && FORMA_TOKEN.test(token);
}

export interface InvitacionGuardada {
  token: string;
  en: number;
  /** La cuenta que la usó primero. Sin ella, todavía no ha entrado nadie. */
  cuenta?: string;
}

export function serializarInvitacion(token: string, ahora: number, cuenta?: string): string {
  return JSON.stringify(cuenta ? { token, en: ahora, cuenta } : { token, en: ahora });
}

function leer(raw: string | null, ahora: number): InvitacionGuardada | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { token?: unknown; en?: unknown; cuenta?: unknown };
    if (!tokenConForma(v.token) || typeof v.en !== 'number') return null;
    const edad = ahora - v.en;
    if (edad < 0 || edad >= VIGENCIA_INVITACION_MS) return null;
    return { token: v.token, en: v.en, cuenta: typeof v.cuenta === 'string' ? v.cuenta : undefined };
  } catch {
    return null;
  }
}

/** El token guardado si sigue vigente y tiene forma de token; si no, null. No mira la cuenta. */
export function invitacionVigente(raw: string | null, ahora: number): string | null {
  return leer(raw, ahora)?.token ?? null;
}

/**
 * La invitación para la cuenta que ha entrado. La primera que la usa se la
 * queda (`guardar`); otra cuenta no la ve y se descarta (`borrar`).
 */
export function invitacionParaCuenta(
  raw: string | null, ahora: number, cuenta: string,
): { token: string | null; guardar: string | null; borrar: boolean } {
  const inv = leer(raw, ahora);
  if (!inv) return { token: null, guardar: null, borrar: raw != null };
  if (!inv.cuenta) return { token: inv.token, guardar: serializarInvitacion(inv.token, inv.en, cuenta), borrar: false };
  if (inv.cuenta !== cuenta) return { token: null, guardar: null, borrar: true };
  return { token: inv.token, guardar: null, borrar: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Terceros de una supresión: lo que no cabe en la transacción de
// `anonimizar_socio` (cliente de Stripe en la cuenta del estudio, cuenta de
// acceso en auth.users). Se hace DESPUÉS, con reintentos, y lo que falla se
// guarda en `supresiones.terceros_pendientes` y se le dice al panel.
//
// Puro, sin I/O (el reloj y la espera se inyectan para poder testearlo).
// ─────────────────────────────────────────────────────────────────────────────

export type TerceroSupresion = 'stripe_customer' | 'cuenta_acceso';

export interface TerceroPendiente {
  tercero: TerceroSupresion;
  /** Id en el tercero (cus_… / uuid). Hace falta para reintentar. */
  ref: string;
  /** Cuenta conectada del estudio, solo para Stripe. */
  cuenta?: string | null;
  motivo: string;
  en: string;
}

export interface OpcionesReintento {
  intentos?: number;
  esperaBaseMs?: number;
  dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Ejecuta `fn` hasta `intentos` veces con espera creciente (base, 3×base…).
 * Devuelve el último error si ninguno sale bien; nunca lanza.
 */
export async function conReintentos(
  fn: () => Promise<void>,
  { intentos = 3, esperaBaseMs = 300, dormir = dormirReal }: OpcionesReintento = {},
): Promise<{ ok: true; intentos: number } | { ok: false; intentos: number; error: string }> {
  let ultimo = 'error desconocido';
  for (let i = 1; i <= intentos; i++) {
    try {
      await fn();
      return { ok: true, intentos: i };
    } catch (e) {
      ultimo = mensajeDe(e);
      if (i < intentos) await dormir(esperaBaseMs * 3 ** (i - 1));
    }
  }
  return { ok: false, intentos, error: ultimo };
}

export function mensajeDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return String(e);
}

/** Stripe: borrar un cliente que ya no existe es el resultado que queremos. */
export function stripeYaNoExiste(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: unknown; statusCode?: unknown; raw?: { code?: unknown } };
  return err.code === 'resource_missing' || err.raw?.code === 'resource_missing' || err.statusCode === 404;
}

/** gotrue: `deleteUser` de una cuenta que ya no existe, ídem. */
export function cuentaYaNoExiste(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { status?: unknown; code?: unknown; message?: unknown };
  if (err.code === 'user_not_found' || err.status === 404) return true;
  return typeof err.message === 'string' && /user not found/i.test(err.message);
}

/** Texto para el panel. Sin ids: a la propietaria le basta con saber QUÉ falta. */
export function avisoPendientes(pendientes: readonly Pick<TerceroPendiente, 'tercero'>[]): string | null {
  if (pendientes.length === 0) return null;
  const partes = new Set(pendientes.map(p =>
    p.tercero === 'stripe_customer' ? 'su ficha de cliente en Stripe' : 'su cuenta de acceso'));
  return `Los datos de la clienta se han borrado del estudio, pero ${[...partes].join(' y ')} `
    + 'no se ha podido borrar todavía. Queda registrado para completarlo; si persiste, escríbenos a soporte.';
}

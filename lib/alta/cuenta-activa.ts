// ─────────────────────────────────────────────────────────────────────────────
// ¿Se manda «Tu cuenta está activa»? (correo 2 del alta nueva,
// app/api/alta/estudio-creado). Puro, para probar la regla sin red.
//
// Lo pide la pantalla de éxito del alta nueva nada más montar el estudio, sin
// esperar la respuesta. El servidor no se fía de que la pida quien debe:
//   · la propietaria del estudio de su sesión (no una sede que gestiona);
//   · un estudio recién creado (`VENTANA_CUENTA_ACTIVA_MS`): pasado ese rato ya
//     no es «tu cuenta está activa», es un correo a destiempo;
//   · que nació del alta nueva (`altas_estudio.version` v2/v2_prueba). Al alta
//     de siempre no le toca: tiene sus propios textos;
//   · y una sola vez: si ya consta en el embudo, no se vuelve a mandar (además
//     de la clave de idempotencia de Resend, que cubre el envío doble a la vez).
// ─────────────────────────────────────────────────────────────────────────────

import { esAltaNueva } from './abandono.ts';

/** Una hora desde que se creó el estudio. */
export const VENTANA_CUENTA_ACTIVA_MS = 60 * 60 * 1000;

export type MotivoSinCuentaActiva =
  | 'no_es_la_propietaria'
  | 'sin_estudio'
  | 'estudio_antiguo'
  | 'no_es_alta_nueva'
  | 'ya_enviado'
  | 'sin_email';

export function decidirCuentaActiva(o: {
  userId: string;
  /** `studios.owner_auth_user_id` del estudio de la sesión. */
  duenoId: string | null | undefined;
  /** `studios.creado_en`. */
  creadoEn: string | null | undefined;
  /** `altas_estudio.version` de la propietaria. */
  version: string | null | undefined;
  yaEnviado: boolean;
  email: string | null | undefined;
  ahoraMs: number;
}): { enviar: true } | { enviar: false; motivo: MotivoSinCuentaActiva } {
  const no = (motivo: MotivoSinCuentaActiva) => ({ enviar: false as const, motivo });
  if (o.creadoEn === undefined || o.duenoId === undefined) return no('sin_estudio');
  if (!o.duenoId || o.duenoId !== o.userId) return no('no_es_la_propietaria');
  const creado = Date.parse(o.creadoEn ?? '');
  if (!Number.isFinite(creado)) return no('sin_estudio');
  const edad = o.ahoraMs - creado;
  // Un reloj un poco adelantado no deja fuera a nadie; uno del futuro lejano, sí.
  if (edad > VENTANA_CUENTA_ACTIVA_MS || edad < -5 * 60 * 1000) return no('estudio_antiguo');
  if (!esAltaNueva(o.version)) return no('no_es_alta_nueva');
  if (o.yaEnviado) return no('ya_enviado');
  if (!o.email) return no('sin_email');
  return { enviar: true };
}

/** La clave de idempotencia de Resend: un correo por estudio, pase lo que pase. */
export function claveCuentaActiva(studioId: string): string {
  return `alta-cuenta-activa:${studioId}`;
}

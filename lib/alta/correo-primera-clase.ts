// ─────────────────────────────────────────────────────────────────────────────
// El correo n.º 3 del alta nueva: «Tu primera clase en Tentare, en 5 minutos»
// (maqueta aprobada del 21-oct-2026, «09 · Correos»). Puro, para probar la regla
// sin red (correo-primera-clase.test.ts); lo manda el cron horario
// `altas-sin-terminar` (lib/alta/recordatorio-servidor.ts).
//
// Cuándo sale (decisión D7 del fundador: «sin clase RESERVABLE», y su texto
// tiene que decir eso):
//   · a un estudio que nació del alta nueva (`altas_estudio.version` v2, y
//     también v2_prueba: sin ella el fundador no puede verlo antes de abrir el
//     alta a todos, y los correos 2 y 4 ya salen a las dos);
//   · desde las 24 h de crearse (la mediana del alta a la primera clase era
//     23,9 h, n = 4) y hasta las 72 h: pasado eso ya no es «al día siguiente»;
//   · si una alumna nueva todavía NO puede reservar (ni el hito
//     `clase_reservable` del embudo ni el SÍ del servidor al preguntar);
//   · UNA vez: la marca `correo_primera_clase` del embudo, más la clave de
//     idempotencia de Resend para dos pasadas a la vez.
// Fuera: sedes de cadena (no pasan por el alta), demos y suspendidos.
//
// Y qué dice, según lo que de verdad le falta (`varianteCorreoPrimeraClase`):
//   · sin ninguna clase, el texto de la maqueta: «le falta tu primera clase»;
//   · con clase que una alumna nueva no puede reservar (pide bono sin Stripe,
//     página oculta, clases pasadas…), eso mismo, con la frase de «¡Listo!» y
//     dónde se arregla. Decirle «crea tu primera clase» a quien ya la tiene
//     sería mentirle.
// ─────────────────────────────────────────────────────────────────────────────

import type { RespuestaPuedeReservar } from '../onboarding/puede-reservar.ts';
import { esAltaNueva } from './abandono.ts';
import { avisoDeClase } from './aviso-clase.ts';
import type { AvisoClase } from './estado.ts';

export const HORAS_DESDE_CORREO_PRIMERA_CLASE = 24;
export const HORAS_HASTA_CORREO_PRIMERA_CLASE = 72;

export type MotivoSinCorreoPrimeraClase =
  | 'no_es_alta_nueva'
  | 'sede_de_cadena'
  | 'demo'
  | 'suspendido'
  | 'aun_no'
  | 'tarde'
  | 'ya_enviado'
  | 'clase_reservable'
  | 'sin_email';

export function decidirCorreoPrimeraClase(o: {
  /** `altas_estudio.version` de su dueña. */
  version: string | null | undefined;
  cadenaId: string | null | undefined;
  esDemo: boolean;
  suspendido: boolean;
  /** `studios.creado_en`. */
  creadoEn: string | null | undefined;
  /** Ya consta `correo_primera_clase` en el embudo. */
  yaEnviado: boolean;
  /** Ya consta `clase_reservable` en el embudo. */
  claseReservable: boolean;
  /** Ausente = aún no se ha leído (se lee solo si lo demás deja mandarlo). */
  email?: string | null;
  ahoraMs: number;
}): { enviar: true } | { enviar: false; motivo: MotivoSinCorreoPrimeraClase } {
  const no = (motivo: MotivoSinCorreoPrimeraClase) => ({ enviar: false as const, motivo });
  if (!esAltaNueva(o.version)) return no('no_es_alta_nueva');
  if (o.cadenaId) return no('sede_de_cadena');
  if (o.esDemo) return no('demo');
  if (o.suspendido) return no('suspendido');
  const creado = Date.parse(o.creadoEn ?? '');
  if (!Number.isFinite(creado)) return no('aun_no');
  const horas = (o.ahoraMs - creado) / 3_600_000;
  if (horas < HORAS_DESDE_CORREO_PRIMERA_CLASE) return no('aun_no');
  if (horas > HORAS_HASTA_CORREO_PRIMERA_CLASE) return no('tarde');
  if (o.yaEnviado) return no('ya_enviado');
  if (o.claseReservable) return no('clase_reservable');
  if (o.email !== undefined && !o.email) return no('sin_email');
  return { enviar: true };
}

/** La clave de idempotencia de Resend: un correo por estudio, pase lo que pase. */
export const claveCorreoPrimeraClase = (studioId: string) => `alta-primera-clase:${studioId}`;

export type VarianteCorreoPrimeraClase =
  /** Ninguna clase: la maqueta tal cual. */
  | { tipo: 'sin_clase' }
  /** Hay clase, pero una alumna nueva aún no puede reservarla: qué falta y dónde se arregla. */
  | { tipo: 'no_reservable'; aviso: AvisoClase }
  /** Ya puede reservar: no se manda (se apunta el hito). */
  | { tipo: 'reservable' }
  /** No se ha podido saber (Stripe no contesta, un fallo): no se manda en esta pasada. */
  | { tipo: 'sin_saber' };

/**
 * Qué le falta de verdad. `haySesiones`: alguna clase no cancelada, pasada o
 * por venir. `veredicto`: lo que contesta `puedeReservarEnServidor` (null si no
 * se pudo preguntar).
 */
export function varianteCorreoPrimeraClase(p: {
  haySesiones: boolean;
  veredicto: RespuestaPuedeReservar | null;
}): VarianteCorreoPrimeraClase {
  if (!p.haySesiones) return { tipo: 'sin_clase' };
  if (!p.veredicto) return { tipo: 'sin_saber' };
  if (p.veredicto.estado === 'SI') return { tipo: 'reservable' };
  const aviso = avisoDeClase(p.veredicto);
  return aviso ? { tipo: 'no_reservable', aviso } : { tipo: 'sin_saber' };
}

// Veri*Factu — cuándo puede un estudio emitir facturas desde Tentare.
//
// Tentare solo funciona como VERI*FACTU (declaración responsable, 1.e = S): emite
// facturas únicamente para un estudio cuyo envío a la AEAT se ha activado alguna
// vez. La cerradura está en la base (migración 20260930170000); esto es lo que la
// pantalla necesita para no ofrecer lo que la base va a rechazar, y para avisar
// de la permanencia al dejar de emitir.

import type { EstadoEstudioVerifactu } from './apoderamiento.ts';

/**
 * Si el alta del envío a la AEAT se ofrece a cualquier estudio desde
 * Configuración → Facturación.
 *
 * ⚠️ Cerrada a propósito (30-sep-2026): el mandato que acepta el estudio remite a
 * un contrato de encargo de tratamiento que aún no existe, y la declaración
 * responsable está sin suscribir. Mientras tanto, el alta solo la ve quien ya la
 * ha empezado (el fundador le pasa el enlace a `/configuracion/verifactu`).
 * Abrirla es cambiar esto a `true`, con esas dos cosas resueltas.
 */
export const ALTA_ABIERTA_A_ESTUDIOS = false;

/** El envío se activó alguna vez: desde ese día el estudio funciona como VERI*FACTU. */
export function envioActivado(activadoEn: string | null | undefined): boolean {
  return !!activadoEn;
}

/**
 * Estados con el poder IZ860 vigente. Una pausa o una suspensión de la AEAT son
 * incidencias: se sigue emitiendo y se remite al volver. VERIFICADO es donde
 * vuelve un estudio al reanudar. Fuera de aquí (poder revocado, caducado o datos
 * fiscales cambiados) Tentare no puede remitir, así que no emite (migración
 * 20260930190000, pregunta 6 de la consulta al fiscalista).
 */
const CON_PODER_VIGENTE: ReadonlySet<EstadoEstudioVerifactu> = new Set(['PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO']);

/** Si Tentare puede emitir facturas para este estudio: envío activado alguna vez Y poder vigente. */
export function puedeEmitir(activadoEn: string | null | undefined, estado: EstadoEstudioVerifactu): boolean {
  return envioActivado(activadoEn) && CON_PODER_VIGENTE.has(estado);
}

/** Si la pantalla de Facturación enseña el camino al alta. */
export function ofrecerAlta(estado: EstadoEstudioVerifactu): boolean {
  return ALTA_ABIERTA_A_ESTUDIOS || estado !== 'SIN_CONFIGURAR';
}

/** En qué punto está el alta, dicho para la propietaria. */
export function pasoDelAlta(estado: EstadoEstudioVerifactu): string {
  switch (estado) {
    case 'SIN_CONFIGURAR': return 'Todavía no has autorizado el envío a la AEAT.';
    case 'PENDIENTE_AUTORIZACION': return 'Falta tu autorización en la AEAT.';
    case 'AUTORIZACION_EN_REVISION': return 'Tentare está comprobando tu autorización en la AEAT.';
    case 'VERIFICADO': return 'Tu autorización está comprobada: falta que Tentare active el envío.';
    default: return 'Tu envío a la AEAT está activo.';
  }
}

export const SOLO_CON_ENVIO_ACTIVO =
  'Tentare solo emite facturas enviando el registro de cada una a la AEAT (Veri*Factu): empiezan el día que se activa tu envío.';

export const SIN_PODER_VIGENTE =
  'Tu autorización a la AEAT ya no está vigente. Sin ella Tentare no puede enviar tus facturas, así que no las emite hasta que la renueves. Mientras tanto, tienen que salir por otro sistema Veri*Factu.';

export const ALTA_AUN_CERRADA =
  'Tentare solo emite facturas enviando el registro de cada una a la AEAT (Veri*Factu), y ese envío todavía no está abierto a los estudios. Mientras tanto, tus cobros dejan su justificante de pago.';

/**
 * Hasta cuándo tiene que seguir funcionando como VERI*FACTU quien deja de emitir
 * hoy (Orden HAC/1177/2024, art. 17.2: «hasta el final del último año en que haya
 * funcionado como tal»). En hora de Madrid: el 31-dic a las 23:30 UTC ya es 1-ene.
 */
export function finDePermanencia(hoy: Date): string {
  const anio = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(hoy);
  return `31 de diciembre de ${anio}`;
}

/** Lo que se le dice al dejar de emitir con el envío ya activado. */
export function avisoPermanencia(hoy: Date): string {
  return `Tu facturación funciona como Veri*Factu, y la norma obliga a seguir así hasta el ${finDePermanencia(hoy)} (Orden HAC/1177/2024, art. 17.2): hasta esa fecha, tus facturas tienen que salir por otro sistema Veri*Factu. Háblalo antes con tu asesoría.`;
}

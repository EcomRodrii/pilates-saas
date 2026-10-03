// «Reservar las próximas N clases» (autoreservable, con bono): lo que no depende de la base de datos. Lo usan el servidor
// (`reservarProximasPublico`) y la app de la alumna, y los dos tienen que decir lo mismo.
//
// ⚠️ NO es una plaza fija: son N reservas NORMALES e independientes, cada una por el camino de siempre
// (`evaluar_reserva` → `crearReservaPublica` → `reservar_plaza`), que descuenta su sesión del bono EN LA MISMA TRANSACCIÓN que
// confirma la plaza. Nunca llevan el prefijo `res-pf-` (nueve sitios lo leen como «paga la cuota, no consume bono»: una reserva
// pagada con bono que lo llevara se cancelaría como «sin cuota» sin devolver la sesión). No hay estado permanente ni se
// renueva sola: al acabar las N, se acabó.
//
// Sin `@/`: lo leen también los tests del runner de Node.

import { franjaLocalDe } from '../utils.ts';
import type { CodigoReserva } from '../student/reserva-codigos.ts';

export const MIN_PROXIMAS = 2;
export const MAX_PROXIMAS = 12;

/** N válido (entero de 2 a 12) o `null`. El saldo del bono no lo manda ni lo decide el cliente. */
export function normalizarN(entrada: unknown): number | null {
  return typeof entrada === 'number' && Number.isInteger(entrada) && entrada >= MIN_PROXIMAS && entrada <= MAX_PROXIMAS ? entrada : null;
}

/** Cuántas puede pedir la alumna: 2, 4, 8 y «todas las que me quedan», sin pasar de lo que le queda ni del tope. */
export function opcionesDeN(saldo: number): number[] {
  const tope = Math.min(Math.floor(saldo), MAX_PROXIMAS);
  if (!(tope >= MIN_PROXIMAS)) return [];
  const base = [2, 4, 8].filter((n) => n <= tope);
  return base.includes(tope) ? base : [...base, tope];
}

export interface SesionDeLaFranja {
  id: string;
  inicio: string;
  salaId: string;
  tipoClaseId: string | null;
  cancelada: boolean;
}

/**
 * Las `n` próximas clases del MISMO horario que `base` (misma sala, mismo tipo, mismo día de la semana y misma hora en la zona
 * del estudio), empezando por la propia `base`. No canceladas y futuras. Una semana sin clase (cierre, festivo) no cuenta como
 * una de las `n`: se pasa a la siguiente. Las que ya tiene reservadas entran en la cuenta (salen como «ya reservada»).
 */
export function ocurrenciasDeLaFranja(
  base: SesionDeLaFranja, candidatas: SesionDeLaFranja[], n: number, ahoraMs: number,
): SesionDeLaFranja[] {
  const f = franjaLocalDe(base.inicio);
  const mismaFranja = (s: SesionDeLaFranja) => {
    if (s.cancelada || s.salaId !== base.salaId || (s.tipoClaseId ?? null) !== (base.tipoClaseId ?? null)) return false;
    if (new Date(s.inicio).getTime() <= ahoraMs) return false;
    const g = franjaLocalDe(s.inicio);
    return g.dow === f.dow && g.hora === f.hora && g.minuto === f.minuto;
  };
  const todas = [base, ...candidatas.filter((s) => s.id !== base.id)].filter(mismaFranja);
  return todas.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id)).slice(0, n);
}

export type ResultadoOcurrencia =
  | 'RESERVADA' | 'SE_RESERVARA' | 'YA_RESERVADA' | 'COMPLETA' | 'SIN_DERECHO' | 'SUPERA_TOPE'
  | 'FUERA_DE_VENTANA' | 'CONFLICTO' | 'CERRADA' | 'EN_ESPERA' | 'NO_INTENTADA' | 'ERROR';

export interface Clasificacion {
  resultado: ResultadoOcurrencia;
  /** `true`: no se sigue con las siguientes (agotado el derecho, o una regla que las alcanza a todas). */
  parar: boolean;
}

/**
 * Qué hacer con cada rechazo de una ocurrencia. EXHAUSTIVA sobre `CodigoReserva`: un código nuevo sin fila no compila.
 * «Omitir» = esa clase no, las siguientes sí (completa, otro choque de horario…). «Parar» = sin derecho o una regla que las
 * alcanza a todas: seguir sería intentar reservar sin derecho, o insistir en lo que va a fallar igual.
 */
const CLASIFICACION: Record<CodigoReserva, Clasificacion> = {
  'ya-reservada': { resultado: 'YA_RESERVADA', parar: false },
  'conflicto-horario': { resultado: 'CONFLICTO', parar: false },
  'aforo-lleno': { resultado: 'COMPLETA', parar: false },
  'limite-semanal': { resultado: 'SUPERA_TOPE', parar: false },
  'limite-semanal-actividad': { resultado: 'SUPERA_TOPE', parar: false },
  'spot-ocupado': { resultado: 'ERROR', parar: true },
  'spot-no-disponible': { resultado: 'ERROR', parar: true },
  'sesion-no-encontrada': { resultado: 'CERRADA', parar: false },
  'no-autorizado': { resultado: 'ERROR', parar: true },
  'clase-cancelada': { resultado: 'CERRADA', parar: false },
  'clase-ya-empezada': { resultado: 'CERRADA', parar: false },
  'fuera-ventana-minima': { resultado: 'FUERA_DE_VENTANA', parar: false },
  // Las siguientes están aún más lejos: caen todas fuera de la ventana máxima.
  'fuera-ventana-maxima': { resultado: 'FUERA_DE_VENTANA', parar: true },
  'sin-plan': { resultado: 'SIN_DERECHO', parar: true },
  'bono-no-cubre': { resultado: 'SIN_DERECHO', parar: true },
  'max-simultaneas': { resultado: 'SUPERA_TOPE', parar: true },
  'max-por-dia': { resultado: 'SUPERA_TOPE', parar: false },
  'necesita-autorizacion': { resultado: 'SIN_DERECHO', parar: true },
  'impago': { resultado: 'SIN_DERECHO', parar: true },
  'estudio-cerrado': { resultado: 'CERRADA', parar: false },
  'apertura-suave': { resultado: 'SIN_DERECHO', parar: true },
  'faltan-preguntas': { resultado: 'SIN_DERECHO', parar: true },
  'error': { resultado: 'ERROR', parar: true },
};

/** Un código que no se conoce es un error que PARA el lote: nunca se sigue reservando a ciegas. */
export function clasificarCodigo(codigo: string | null | undefined): Clasificacion {
  return (codigo && (CLASIFICACION as Record<string, Clasificacion | undefined>)[codigo]) || { resultado: 'ERROR', parar: true };
}

export const CODIGOS_CLASIFICADOS = Object.keys(CLASIFICACION) as CodigoReserva[];

const RE_INTENTO = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * El intento de la alumna (un id que genera la app al abrir la hoja) → o `null` si no vale. ⚠️ Nunca uno que empiece por `pf-`:
 * el id de reserva sería `res-pf-…`, el prefijo de las plazas fijas (ver arriba).
 */
export function normalizarIntento(entrada: unknown): string | null {
  return typeof entrada === 'string' && RE_INTENTO.test(entrada) && !/^pf[-_]/i.test(entrada) ? entrada : null;
}

/**
 * El id de la reserva de la ocurrencia `i` de ese intento. La clave es el INTENTO, no el contenido: un reintento del mismo
 * intento (la red falló a medias) cae en las mismas reservas y no duplica nada; un intento nuevo, aunque pida lo mismo otro día,
 * es otro. Cumple el patrón de ids de reserva (`^res-[A-Za-z0-9_-]{1,96}$`) y nunca es `res-pf-…`.
 */
export function idReservaDeIntento(intentoId: string, i: number): string {
  return `res-${intentoId}-${i}`;
}

export interface OcurrenciaDeLote {
  resultado: ResultadoOcurrencia;
  pagador?: 'bono' | 'cuota' | 'ninguno';
}

export interface ResumenLote {
  /** Las que están reservadas (o se reservarán, en la vista previa). */
  reservadas: number;
  /** De ellas, las que se pagan con una sesión del bono. */
  descontadas: number;
}

export function resumirLote(oc: OcurrenciaDeLote[]): ResumenLote {
  const hechas = oc.filter((o) => o.resultado === 'RESERVADA' || o.resultado === 'SE_RESERVARA');
  return { reservadas: hechas.length, descontadas: hechas.filter((o) => o.pagador === 'bono').length };
}

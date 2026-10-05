// «Mis clases → Fija» (rediseño aprobado del 5-oct-2026): lo que se le enseña a
// la alumna de su clase fija, decidido aquí y no en el JSX. Puro, con imports
// relativos y `.ts` (lo prueba `node --test`).
//
// ⚠️ Nada de aquí decide una reserva ni anuncia algo que el servidor no haya
// dicho: las semanas salen de reservas que EXISTEN (mismo criterio que el
// calendario del mes, `marcasDelMes`), y lo que pasó al decir «no voy» sale de
// la respuesta de `cancelar_reserva_plaza`.

import { marcasDelMes, nombreMes, type MarcaDiaFijo, type PlazaCalendario, type ReservaCalendario, type SesionCalendario } from '../plazas-fijas-calendario.ts';
import { inicioEnEstudio } from './maquina-reserva.ts';

// ── El estado de su clase, arriba a la derecha de la tarjeta ─────────────────

export type TonoClaseFija = 'activa' | 'pausa' | 'sin-clase' | 'pedida';

export interface PlazaParaEstado {
  estado: 'ACTIVA' | 'PAUSADA';
  sinClase: boolean;
  vigenciaHasta: string | null;
  pausa: { desde: string; hasta: string; enCurso: boolean } | null;
}

/**
 * Lo que dice la tarjeta de su clase: el estado (con lo que está en marcha), hasta
 * cuándo la tiene y la frase de debajo. `pedida` = la pausa que ha pedido y el
 * estudio aún no ha contestado (manda sobre «Activa»: es lo que está esperando).
 */
export function estadoTarjetaFija(
  plaza: PlazaParaEstado,
  pausaPedida: { desde: string; hasta: string } | null,
  fechaCorta: (iso: string) => string,
): { texto: string; tono: TonoClaseFija; hasta: string; frase: string } {
  const hasta = plaza.vigenciaHasta ? `Hasta el ${fechaCorta(plaza.vigenciaHasta)}` : 'Sin fecha de fin';
  if (plaza.sinClase) {
    return { texto: 'Sin clase', tono: 'sin-clase', hasta, frase: 'Ahora no hay clase en ese horario: pregúntale al estudio.' };
  }
  if (plaza.pausa?.enCurso || plaza.estado === 'PAUSADA') {
    return {
      texto: plaza.pausa?.enCurso ? `En pausa hasta el ${fechaCorta(plaza.pausa.hasta)}` : 'En pausa',
      tono: 'pausa', hasta,
      frase: 'Está en pausa: mientras dure no se te reserva la clase. Al terminar la pausa vuelve sola.',
    };
  }
  if (pausaPedida) {
    return { texto: 'Pausa pedida', tono: 'pedida', hasta, frase: FRASE_ACTIVA };
  }
  return { texto: 'Activa', tono: 'activa', hasta, frase: FRASE_ACTIVA };
}

export const FRASE_ACTIVA = 'Se reserva sola cada semana. Tú solo avisa si un día no vas.';

// ── Las próximas semanas, como píldoras ──────────────────────────────────────

/**
 * - `va`: tiene la reserva de su clase fija (`reservaId` = la `res-pf-` que se cancela al decir «no voy»).
 * - `va-a-mano`: tiene plaza, pero reservada a mano: «no voy» no es cosa de su clase fija, se cancela desde su ficha.
 * - `no-va`: esa semana la canceló.
 * - `pausa`: cae en su pausa.
 * - `sin-reservar`: hay clase y no tiene reserva (llena, sin cuota…): no se promete nada.
 */
export type EstadoSemana = 'va' | 'va-a-mano' | 'no-va' | 'pausa' | 'sin-reservar';

export interface SemanaFija {
  fecha: string; hora: string; sesionId: string; estado: EstadoSemana;
  /** Solo en `va`: la reserva de su clase fija de ese día. */
  reservaId: string | null;
}

export interface DatosCalendarioFija { plazas: PlazaCalendario[]; sesiones: SesionCalendario[]; reservas: ReservaCalendario[] }

const ESTADO_POR_MARCA: Record<MarcaDiaFijo, EstadoSemana | null> = {
  RESERVADA: 'va', ASISTIDA: null, NO_ASISTIO: null, NO_VA: 'no-va', PAUSA: 'pausa', SIN_RESERVA: 'sin-reservar',
};

/**
 * Sus próximas `n` semanas de UNA clase fija, desde ahora (una clase de hoy que ya
 * ha empezado no cuenta). Sale del mismo cálculo que el calendario del mes, así
 * que una píldora y un día del calendario no pueden decir cosas distintas.
 *
 * `proximas`: las reservas de su clase fija que ya existen (`res-pf-`, confirmadas),
 * de donde sale la reserva que se cancela. Una semana reservada que no está ahí es
 * una reserva hecha a mano.
 */
export function proximasSemanas(
  plaza: { diaSemana: number; hora: string; salaId: string; proximas: { reservaId: string; sesionId: string }[] },
  datos: DatosCalendarioFija,
  hoy: string,
  horaAhora: string,
  n = 5,
): SemanaFija[] {
  const suya = datos.plazas.find((p) => p.diaSemana === plaza.diaSemana && p.hora.slice(0, 5) === plaza.hora && p.salaId === plaza.salaId);
  if (!suya) return [];
  const fechas = [...new Set(datos.sesiones
    .filter((s) => !s.cancelada && s.salaId === plaza.salaId && s.hora === plaza.hora
      && (s.fecha > hoy || (s.fecha === hoy && s.hora >= horaAhora)))
    .map((s) => s.fecha))].sort();
  const porSesion = new Map(plaza.proximas.map((x) => [x.sesionId, x.reservaId]));
  const salida: SemanaFija[] = [];
  const porMes = new Map<string, ReturnType<typeof marcasDelMes>>();
  for (const fecha of fechas) {
    if (salida.length >= n) break;
    const mes = fecha.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, marcasDelMes(mes, [suya], datos.sesiones, datos.reservas, hoy));
    const dia = porMes.get(mes)?.get(fecha)?.find((d) => d.hora === plaza.hora);
    if (!dia) continue;
    const estado = ESTADO_POR_MARCA[dia.marca];
    if (!estado) continue;
    const reservaId = porSesion.get(dia.sesionId) ?? null;
    salida.push({
      fecha, hora: dia.hora, sesionId: dia.sesionId,
      estado: estado === 'va' && !reservaId ? 'va-a-mano' : estado,
      reservaId: estado === 'va' ? reservaId : null,
    });
  }
  return salida;
}

// ── «No voy»: lo que pasó de verdad ──────────────────────────────────────────
//
// ⚠️ Sin «Deshacer», a propósito. Volver a reservar esa clase por la reserva
// normal NO deja las cosas como estaban: la penalización de una cancelación
// tardía ya está detectada, una recuperación ya creada la alumna no la puede
// anular, el hueco puede haberse ofrecido ya a la siguiente de la lista, y la
// reserva normal aplica reglas que la clase fija se salta (máximo de reservas a
// la vez, ventana de antelación). Deshacerlo de verdad sería restaurar la plaza
// en el servidor, y eso no existe todavía.

export interface RespuestaNoVoy {
  eraConfirmada: boolean;
  /** Cancelada dentro del plazo de cancelación (la cascada tipo → estudio, la decide el servidor). */
  tardia?: boolean;
  recuperacionCreada?: boolean;
  recuperacionCaducaEl?: string | null;
  recuperacionAlCerrarSemana?: boolean;
}

/**
 * Lo que se le dice tras «no voy», con lo que contestó el servidor.
 * `invitarAReservar`: si se le ofrece volver a reservarla desde su ficha. Solo
 * cuando volver no le regala nada ni le esconde nada:
 * - con una recuperación ya creada, NO: se quedaría con la clase y la recuperación;
 * - tardía, NO: volver a ir no anula la cancelación tardía (ni una penalización);
 * - si la recuperación se reparte al cerrar la semana, SÍ: el barrido no compensa
 *   una clase a la que volvió (`canceladasCompensables`).
 */
export function trasNoIr(res: RespuestaNoVoy, fechaCorta: (iso: string) => string): { texto: string; invitarAReservar: boolean } {
  if (res.recuperacionCreada) {
    const hasta = res.recuperacionCaducaEl ? ` hasta el ${fechaCorta(res.recuperacionCaducaEl)}` : '';
    return { texto: `Tienes una clase para recuperar${hasta}: úsala desde el horario. Tu clase fija sigue activa.`, invitarAReservar: false };
  }
  if (res.tardia) {
    return { texto: 'Fuera de plazo: esta vez no hay clase para recuperar. Tu clase fija sigue activa.', invitarAReservar: false };
  }
  if (res.recuperacionAlCerrarSemana) {
    return {
      texto: 'Si no usas ese hueco esta semana, al acabarla tendrás una clase para recuperar. Tu clase fija sigue activa.',
      invitarAReservar: true,
    };
  }
  return { texto: 'Tu clase fija sigue activa.', invitarAReservar: true };
}

/**
 * La línea de la penalización en la confirmación de cancelar, o `null`.
 * Sale solo si de verdad se cobraría por ESA clase y AHORA: el importe
 * (`penalizacionTardiaQueSeCobraria`) y la ventana (`horasDeCobroTardio`: la menor
 * entre la de la detección y la del contrato), los dos resueltos por su sesión.
 * Con la ventana de la detección a secas avisaba de cargos que el guardia no cobra
 * (un tipo de clase de 24 h en un estudio de 12 h, cancelando a 18 h). Dice
 * «puede»: cobrarla depende también de su tarjeta y de lo que firmó.
 */
export function avisoPenalizacionTardia(
  c: { fecha: string; hora: string; penalizacionTardiaEur?: number | null; penalizacionTardiaHoras?: number | null },
  ahora: Date,
  euros: (n: number) => string,
): string | null {
  const importe = c.penalizacionTardiaEur;
  const horas = c.penalizacionTardiaHoras;
  if (!(typeof importe === 'number' && importe > 0) || !(typeof horas === 'number' && horas > 0)) return null;
  // El mismo corte que la detección y el guardia (`cancelada >= inicio - horas`),
  // con la hora del ESTUDIO (`inicioEnEstudio`), no la del móvil.
  const restan = (inicioEnEstudio(c.fecha, c.hora) - ahora.getTime()) / 36e5;
  return restan > 0 && restan <= horas ? `Tu estudio puede cobrarte ${euros(importe)} por cancelar tan tarde.` : null;
}

// ── «Ver el mes entero»: la línea de debajo ──────────────────────────────────

/**
 * «Octubre: 4 clases, 1 que no vas · 2 sin reservar». `null` si este mes no le
 * queda nada. Una clase sin reserva NO es una de sus clases: puede estar llena o
 * no cubrirla su cuota, así que se cuenta aparte y no se promete.
 */
export function resumenDelMes(datos: DatosCalendarioFija, hoy: string): string | null {
  const mes = hoy.slice(0, 7);
  let clases = 0;
  let noVa = 0;
  let sinReservar = 0;
  for (const [fecha, dias] of marcasDelMes(mes, datos.plazas, datos.sesiones, datos.reservas, hoy)) {
    if (fecha < hoy) continue;
    for (const d of dias) {
      if (d.marca === 'PAUSA') continue;
      if (d.marca === 'SIN_RESERVA') { sinReservar++; continue; }
      clases++;
      if (d.marca === 'NO_VA') noVa++;
    }
  }
  if (clases === 0 && sinReservar === 0) return null;
  const nombre = nombreMes(mes).split(' de ')[0];
  const partes: string[] = [];
  if (clases > 0) partes.push(clases === 1 ? '1 clase' : `${clases} clases`);
  if (noVa > 0) partes.push(noVa === 1 ? '1 que no vas' : `${noVa} que no vas`);
  const sin = sinReservar > 0 ? `${sinReservar} sin reservar` : null;
  const texto = [partes.join(', '), sin].filter(Boolean).join(' · ');
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}: ${texto}`;
}

// ── Sin clase fija: cómo se pide ─────────────────────────────────────────────

/**
 * Cómo se consigue, diciendo la verdad sobre ESTE estudio y sobre ELLA:
 * - si el estudio no deja pedirla desde la app, el paso es pedírsela a él;
 * - si la aprueba solo, no se le promete que «tu estudio la confirma»;
 * - sin una cuota que cubra sus clases, la ficha no le enseña el interruptor (con
 *   bono no hay clase fija): primero la cuota, y no se le enseña de muestra un
 *   interruptor que no va a encontrar. Con bono, lo que sí tiene en la ficha es
 *   reservar varias semanas de una vez (solo si el estudio deja pedirla desde la app).
 */
export function comoConseguirla(
  estudio: { puedePedirPlazaFija?: boolean; plazaFijaAutomatica?: boolean },
  tieneCuota: boolean,
): { pasos: string[]; muestraInterruptor: boolean; conBono: string | null } {
  const desdeLaApp = estudio.puedePedirPlazaFija === true;
  const cuota = 'Consigue una cuota que cubra tus clases: la clase fija va con cuota, no con bono';
  if (!desdeLaApp) {
    return {
      pasos: tieneCuota
        ? ['Elige la clase a la que vas siempre', 'Pídesela a tu estudio (en recepción o por mensaje)', 'Cuando te la den, aparece aquí y se reserva sola']
        : [cuota, 'Pídesela a tu estudio (en recepción o por mensaje)', 'Cuando te la den, aparece aquí y se reserva sola'],
      muestraInterruptor: false, conBono: null,
    };
  }
  const confirma = estudio.plazaFijaAutomatica === true
    ? 'Si cumples las reglas de tu estudio, es tuya al momento; si no, la confirma'
    : 'Tu estudio la confirma y ya está';
  if (!tieneCuota) {
    return {
      pasos: [cuota, 'Abre la clase a la que vas siempre y activa «Clase fija»', confirma],
      muestraInterruptor: false,
      conBono: 'Con bono, desde la ficha de una clase puedes reservar varias semanas de una vez.',
    };
  }
  return { pasos: ['Abre la clase a la que vas siempre', 'Activa «Clase fija» y elige hasta cuándo', confirma], muestraInterruptor: true, conBono: null };
}

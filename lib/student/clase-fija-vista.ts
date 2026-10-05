// «Mis clases → Fija» (rediseño aprobado del 5-oct-2026): lo que se le enseña a
// la alumna de su clase fija, decidido aquí y no en el JSX. Puro, con imports
// relativos y `.ts` (lo prueba `node --test`).
//
// ⚠️ Nada de aquí decide una reserva ni anuncia algo que el servidor no haya
// dicho: las semanas salen de reservas que EXISTEN (mismo criterio que el
// calendario del mes, `marcasDelMes`), y lo que pasó al decir «no voy» sale de
// la respuesta de `cancelar_reserva_plaza`.

import { marcasDelMes, nombreMes, type MarcaDiaFijo, type PlazaCalendario, type ReservaCalendario, type SesionCalendario } from '../plazas-fijas-calendario.ts';

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

// ── «No voy»: lo que pasó de verdad, y si se puede deshacer ──────────────────

export interface RespuestaNoVoy {
  eraConfirmada: boolean;
  tardia?: boolean;
  recuperacionCreada?: boolean;
  recuperacionCaducaEl?: string | null;
  recuperacionAlCerrarSemana?: boolean;
}

/** La frase de debajo de las píldoras tras decir «no voy», con lo que contestó el servidor. */
export function lineaTrasNoIr(res: RespuestaNoVoy, fechaCorta: (iso: string) => string): string {
  if (res.recuperacionCreada) {
    const hasta = res.recuperacionCaducaEl ? ` hasta el ${fechaCorta(res.recuperacionCaducaEl)}` : '';
    return `Tienes una clase para recuperar${hasta}. Tu clase fija sigue activa.`;
  }
  if (res.recuperacionAlCerrarSemana) {
    return 'Si no usas ese hueco esta semana, al acabarla tendrás una clase para recuperar. Tu clase fija sigue activa.';
  }
  if (res.tardia) return 'Fuera de plazo: esta vez no hay clase para recuperar. Tu clase fija sigue activa.';
  return 'Tu clase fija sigue activa.';
}

/**
 * ¿Se puede ofrecer «Deshacer»? Solo cuando volver a reservar esa clase (por la
 * reserva de siempre) deja las cosas como estaban:
 *
 * - Con una recuperación ya creada, NO: la alumna no puede anularla
 *   (`anular_recuperacion` es del mostrador) y se quedaría con la clase Y la
 *   recuperación — una clase de regalo.
 * - Tardía, NO: puede haber una penalización detectada por la cancelación, y
 *   volver a reservar no la deshace.
 * - Si la recuperación se reparte al cerrar la semana, SÍ: volver a ocupar el
 *   hueco es justo lo que hace que no se reparta.
 *
 * Aun así puede no salir (alguien ha cogido el sitio): eso lo dice el servidor.
 */
export function puedeDeshacerNoVoy(res: RespuestaNoVoy): boolean {
  return res.eraConfirmada && !res.tardia && !res.recuperacionCreada;
}

/**
 * Lo que pasó al pulsar «Deshacer» (volver a reservar esa clase por la reserva de
 * siempre), dicho con lo que contestó el servidor. `vuelve` = tiene plaza otra vez.
 * Si el sitio ya lo ha cogido otra persona, se dice: no es un «deshecho».
 */
export function lineaTrasDeshacer(d: {
  state: string; posicionEspera?: number | null; pendienteAprobacion?: boolean;
  recuperacionUsada?: { caducaEl: string | null } | null; mensaje?: string;
}): { texto: string; vuelve: boolean } {
  switch (d.state) {
    case 'confirmed':
      return { vuelve: true, texto: d.recuperacionUsada ? 'Vuelves a ir. Se ha usado una de tus clases por recuperar.' : 'Vuelves a ir.' };
    case 'waitlisted':
      return d.pendienteAprobacion
        ? { vuelve: false, texto: 'Vuelve a estar pedida: tu estudio tiene que aprobarla.' }
        : { vuelve: false, texto: `Ya había cogido el sitio otra persona: estás en la lista de espera${d.posicionEspera ? ` (puesto ${d.posicionEspera})` : ''}.` };
    case 'duplicate': return { vuelve: true, texto: 'Ya la tienes reservada.' };
    case 'full': return { vuelve: false, texto: d.mensaje ?? 'Ya no queda sitio en esa clase: no se ha podido deshacer.' };
    case 'offline': return { vuelve: false, texto: 'Sin conexión: no se ha podido deshacer. Inténtalo cuando tengas red.' };
    default: return { vuelve: false, texto: d.mensaje ?? 'No se ha podido deshacer. Tu clase de ese día sigue cancelada.' };
  }
}

// ── «Ver el mes entero»: la línea de debajo ──────────────────────────────────

/** «Octubre: 4 clases, 1 que no vas». `null` si este mes no le queda ninguna. */
export function resumenDelMes(datos: DatosCalendarioFija, hoy: string): string | null {
  const mes = hoy.slice(0, 7);
  let clases = 0;
  let noVa = 0;
  for (const [fecha, dias] of marcasDelMes(mes, datos.plazas, datos.sesiones, datos.reservas, hoy)) {
    if (fecha < hoy) continue;
    for (const d of dias) {
      if (d.marca === 'PAUSA') continue;
      clases++;
      if (d.marca === 'NO_VA') noVa++;
    }
  }
  if (clases === 0) return null;
  const nombre = nombreMes(mes).split(' de ')[0];
  const partes = [`${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}: ${clases === 1 ? '1 clase' : `${clases} clases`}`];
  if (noVa > 0) partes.push(noVa === 1 ? '1 que no vas' : `${noVa} que no vas`);
  return partes.join(', ');
}

// ── Sin clase fija: cómo se pide ─────────────────────────────────────────────

/**
 * Los tres pasos, diciendo la verdad sobre ESTE estudio: si no deja pedirla
 * desde la app, el paso es pedírsela a él; si la aprueba solo, no se le promete
 * que «tu estudio la confirma».
 */
export function pasosParaPedirla(estudio: { puedePedirPlazaFija?: boolean; plazaFijaAutomatica?: boolean }): string[] {
  if (estudio.puedePedirPlazaFija !== true) {
    return [
      'Elige la clase a la que vas siempre',
      'Pídesela a tu estudio (en recepción o por mensaje)',
      'Cuando te la den, aparece aquí y se reserva sola',
    ];
  }
  return [
    'Abre la clase a la que vas siempre',
    'Activa «Clase fija» y elige hasta cuándo',
    estudio.plazaFijaAutomatica === true
      ? 'Si cumples las reglas de tu estudio, es tuya al momento; si no, la confirma'
      : 'Tu estudio la confirma y ya está',
  ];
}

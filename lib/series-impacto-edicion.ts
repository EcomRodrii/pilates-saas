// Qué provoca «Guardar esta y las siguientes» en una serie, ANTES de guardarlo.
// Sin I/O: lo usa el diálogo de confirmación del calendario.
//
// Hasta ahora ese botón ejecutaba al instante y el efecto solo se veía después
// (un toast). Mover una serie de hora con 40 reservas confirmadas manda un aviso
// a cada alumna, mueve las plazas fijas y toca la lista de espera: eso hay que
// enseñarlo antes, no descubrirlo en el buzón de las alumnas.
//
// ⚠️ Lo que se DICE aquí tiene que ser lo que DE VERDAD ocurre. Cada regla es
// un espejo de otra que vive en otro sitio, y si aquella cambia, esta también:
//
//  · A QUIÉN se avisa: solo a las reservas CONFIRMADA, solo de las clases que
//    cambian de hora, sala o instructora, y una sola vez por alumna aunque
//    cambien varias de sus clases — `avisar-cambio-serie/route.ts` +
//    `sociasDeSesion` (`lib/notifications/recipients.ts`, por defecto solo
//    'CONFIRMADA': quien está en lista de espera no recibe aviso) + `avisoPorAlumna`.
//  · Qué clases cambian de hora: `horarioConNuevaHora`, el espejo de la RPC
//    `editar_serie_desde` (respeta el cambio de horario de verano).
//  · Qué plazas fijas hay en el tramo: `sesionEncajaEnPlaza`, el espejo del JOIN
//    de la RPC. Y que la RPC las mueve con la serie está en
//    `20260904153000` (PR #1620).
//
// Los datos salen del contexto del panel, como los avisos de «Cancelar clase»:
// lo mismo que ya ve la propietaria en pantalla, no una consulta nueva.

import { avisoPorAlumna } from './avisos-serie.ts';
import { esHoraHHMM } from './citas/slots.ts';
import { sesionEncajaEnPlaza } from './plazas-fijas-slot.ts';
import { horarioConNuevaHora } from './serie-horario.ts';
import type { PlazaFija, Recuperacion } from './types.ts';

/** Una clase del tramo que se va a editar (esta y las siguientes de su serie). */
export interface SesionDeSerie {
  id: string;
  inicio: string;
  salaId: string;
  tipoClaseId: string;
  instructorId: string;
  aforoMaximo: number;
  cancelada: boolean;
  notas: string | null;
}

/** Los valores del formulario: lo que TODAS las clases del tramo pasarán a tener. */
export interface EdicionDeSerie {
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  aforoMaximo: number;
  horaInicio: string;
  horaFin: string;
  notas: string | null;
}

export interface ReservaDeImpacto { id: string; sesionId: string; socioId: string; estado: string }

/** Cuántas clases del tramo cambian en cada cosa. */
export interface ClasesQueCambian {
  hora: number;
  sala: number;
  instructora: number;
  tipo: number;
  aforo: number;
  notas: number;
}

export interface ImpactoEdicionSerie {
  /** Clases del tramo: las mismas que cuenta el toast «Serie actualizada · N clases». */
  clases: number;
  /** Inicio (ISO) de la primera: desde cuándo. `null` si el tramo está vacío. */
  primeraISO: string | null;
  cambian: ClasesQueCambian;
  /** Reservas CONFIRMADA en clases que cambian de hora, sala o instructora. */
  reservasAfectadas: number;
  /** Alumnas distintas a las que el servidor avisará (una vez cada una). */
  alumnasAvisadas: number;
  /** Alumnas con plaza fija (activa o en pausa) cuyo hueco cae en alguna clase del tramo. */
  alumnasConPlazaFija: number;
  /** Personas distintas en lista de espera de clases que cambian. No reciben aviso. */
  enEspera: number;
  /** Reservas afectadas que se hicieron gastando una recuperación. */
  reservasConRecuperacion: number;
  /** Clases donde, con el aforo nuevo, hay más confirmadas que plazas. */
  clasesSobreAforo: number;
  /** El aforo nuevo, para decirlo en el aviso. */
  aforoNuevo: number;
  /** No cambia nada en ninguna clase del tramo. */
  sinCambios: boolean;
}

/** Qué cambia en UNA clase del tramo con los valores del formulario. */
export interface CambioPorClase<S extends SesionDeSerie = SesionDeSerie> {
  sesion: S;
  /** El inicio (ISO) que tendrá: misma fecha local, hora nueva. */
  nuevoInicio: string;
  hora: boolean;
  sala: boolean;
  instructora: boolean;
  /** Cambia lo que las alumnas ven: es lo que dispara el aviso. */
  avisa: boolean;
}

/**
 * LA definición de «qué clases del tramo cambian». La usan la vista previa y el
 * guardado (`editarSerie`, que arma con esto los avisos): que sea una sola
 * función es lo que impide que el diálogo diga «no se avisa a nadie» y el
 * guardado avise a todas.
 *
 * ⚠️ Los instantes se comparan como INSTANTES. La base devuelve `inicio` como
 * `2027-09-02T17:30:00+00:00` y `toISOString()` da `…17:30:00.000Z`: comparados
 * como texto son siempre «distintos», y `editarSerie` daba por cambiada la hora
 * de TODAS las clases en cada edición de serie (avisaba a todas las alumnas de
 * un «cambio de horario» aunque solo se hubiera tocado el aforo, y titulaba
 * «Cambio de horario» el aviso de un simple cambio de instructora). La edición
 * de una clase suelta ya lo hacía bien (`mismoInstante`).
 */
export function cambiosPorClase<S extends SesionDeSerie>(tramo: readonly S[], edicion: EdicionDeSerie): CambioPorClase<S>[] {
  // Una hora vacía o rota (un <input type="time"> borrado) no puede lanzar aquí:
  // se trata como «la hora no cambia». Quien guarda ya no la deja pasar.
  const horaValida = esHoraHHMM(edicion.horaInicio) && esHoraHHMM(edicion.horaFin);
  return tramo.map(sesion => {
    const nuevoInicio = horaValida ? horarioConNuevaHora(sesion.inicio, edicion.horaInicio, edicion.horaFin).inicio : sesion.inicio;
    const hora = Date.parse(sesion.inicio) !== Date.parse(nuevoInicio);
    const sala = sesion.salaId !== edicion.salaId;
    const instructora = sesion.instructorId !== edicion.instructorId;
    return { sesion, nuevoInicio, hora, sala, instructora, avisa: hora || sala || instructora };
  });
}

export function calcularImpactoEdicionSerie(entrada: {
  tramo: readonly SesionDeSerie[];
  edicion: EdicionDeSerie;
  reservas: readonly ReservaDeImpacto[];
  plazasFijas: readonly PlazaFija[];
  recuperaciones: readonly Pick<Recuperacion, 'estado' | 'usadaEnReservaId'>[];
}): ImpactoEdicionSerie {
  const { tramo, edicion, reservas, plazasFijas, recuperaciones } = entrada;
  const notasNuevas = edicion.notas || null;

  const cambian: ClasesQueCambian = { hora: 0, sala: 0, instructora: 0, tipo: 0, aforo: 0, notas: 0 };
  const quienesAvisan: { id: string; nuevoInicio: string }[] = [];
  for (const c of cambiosPorClase(tramo, edicion)) {
    const s = c.sesion;
    if (c.hora) cambian.hora++;
    if (c.sala) cambian.sala++;
    if (c.instructora) cambian.instructora++;
    if (s.tipoClaseId !== edicion.tipoClaseId) cambian.tipo++;
    if (s.aforoMaximo !== edicion.aforoMaximo) cambian.aforo++;
    if ((s.notas || null) !== notasNuevas) cambian.notas++;
    // Las canceladas no tienen a nadie a quien avisar: el servidor las salta.
    if (!s.cancelada && c.avisa) quienesAvisan.push({ id: s.id, nuevoInicio: c.nuevoInicio });
  }
  const sinCambios = Object.values(cambian).every(n => n === 0);

  const vivas = tramo.filter(s => !s.cancelada);
  const idsVivas = new Set(vivas.map(s => s.id));
  const confirmadas = new Map<string, ReservaDeImpacto[]>();
  const esperaPorSesion = new Map<string, string[]>();
  for (const r of reservas) {
    if (!idsVivas.has(r.sesionId)) continue;
    if (r.estado === 'CONFIRMADA') confirmadas.set(r.sesionId, [...(confirmadas.get(r.sesionId) ?? []), r]);
    else if (r.estado === 'LISTA_ESPERA') esperaPorSesion.set(r.sesionId, [...(esperaPorSesion.get(r.sesionId) ?? []), r.socioId]);
  }

  // A quién avisa el servidor: por alumna, en orden de fecha NUEVA, una vez.
  const enOrden = [...quienesAvisan].sort((a, b) => a.nuevoInicio.localeCompare(b.nuevoInicio)).map(q => q.id);
  const avisos = avisoPorAlumna(
    enOrden,
    new Map(enOrden.map(id => [id, (confirmadas.get(id) ?? []).map(r => r.socioId)])),
  );

  let reservasAfectadas = 0;
  const usadasEnAfectadas = new Set<string>();
  const enEspera = new Set<string>();
  for (const id of enOrden) {
    for (const r of confirmadas.get(id) ?? []) { reservasAfectadas++; usadasEnAfectadas.add(r.id); }
    for (const socio of esperaPorSesion.get(id) ?? []) enEspera.add(socio);
  }
  const reservasConRecuperacion = recuperaciones
    .filter(rec => rec.estado === 'USADA' && rec.usadaEnReservaId && usadasEnAfectadas.has(rec.usadaEnReservaId)).length;

  const conPlaza = new Set<string>();
  for (const pf of plazasFijas) {
    if (pf.estado !== 'ACTIVA' && pf.estado !== 'PAUSADA') continue;
    if (vivas.some(s => sesionEncajaEnPlaza(pf, s))) conPlaza.add(pf.socioId);
  }

  const clasesSobreAforo = edicion.aforoMaximo > 0
    ? vivas.filter(s => s.aforoMaximo !== edicion.aforoMaximo && (confirmadas.get(s.id)?.length ?? 0) > edicion.aforoMaximo).length
    : 0;

  return {
    clases: tramo.length,
    primeraISO: tramo.length ? [...tramo].map(s => s.inicio).sort()[0] : null,
    cambian,
    reservasAfectadas,
    alumnasAvisadas: avisos.size,
    alumnasConPlazaFija: conPlaza.size,
    enEspera: enEspera.size,
    reservasConRecuperacion,
    clasesSobreAforo,
    aforoNuevo: edicion.aforoMaximo,
    sinCambios,
  };
}

// ─── Textos ──────────────────────────────────────────────────────────────────

export interface LineaImpacto {
  /** `dato`: lo que ocurre. `aviso`: algo a mirar. `calma`: no pasa nada con nadie. */
  tono: 'dato' | 'aviso' | 'calma';
  texto: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «hora», «hora y sala», «hora, sala e instructora». */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} ${/^i/i.test(partes[partes.length - 1]) ? 'e' : 'y'} ${partes[partes.length - 1]}`;
}

export function tituloDeEdicion(clases: number): string {
  return `¿Guardar los cambios en ${plural(clases, 'clase', 'clases')}?`;
}

/** Qué se enseña como consecuencia. Solo lo que aplica: nada de «0 alumnas». */
export function lineasDeImpacto(i: ImpactoEdicionSerie): LineaImpacto[] {
  const out: LineaImpacto[] = [];
  const avisa = i.cambian.hora > 0 || i.cambian.sala > 0 || i.cambian.instructora > 0;

  if (i.sinCambios) {
    return [{ tono: 'calma', texto: 'Estas clases ya tienen estos datos: no cambia nada.' }];
  }

  if (avisa && i.reservasAfectadas > 0) {
    const cosas = enumerar([
      ...(i.cambian.hora > 0 ? ['hora'] : []),
      ...(i.cambian.sala > 0 ? ['sala'] : []),
      ...(i.cambian.instructora > 0 ? ['instructora'] : []),
    ]);
    out.push({
      tono: 'dato',
      texto: `${plural(i.reservasAfectadas, 'reserva confirmada cambia', 'reservas confirmadas cambian')} de ${cosas}.`,
    });
    out.push({
      tono: 'dato',
      texto: `Se avisará a ${plural(i.alumnasAvisadas, 'alumna', 'alumnas')}, una sola vez a cada una aunque cambien varias de sus clases.`,
    });
  }
  if (i.alumnasConPlazaFija > 0) {
    out.push({
      tono: 'dato',
      texto: `${plural(i.alumnasConPlazaFija, 'alumna tiene', 'alumnas tienen')} plaza fija en estas clases${
        i.cambian.hora > 0 || i.cambian.sala > 0 ? ': su plaza se mueve con la serie' : ''}.`,
    });
  }
  if (i.enEspera > 0) {
    out.push({
      tono: 'dato',
      texto: `${plural(i.enEspera, 'persona', 'personas')} en lista de espera de estas clases (no reciben aviso).`,
    });
  }
  if (i.reservasConRecuperacion > 0) {
    out.push({
      tono: 'dato',
      texto: `${plural(i.reservasConRecuperacion, 'reserva se hizo', 'reservas se hicieron')} gastando una recuperación.`,
    });
  }
  if (i.clasesSobreAforo > 0) {
    out.push({
      tono: 'aviso',
      texto: `Con el aforo en ${i.aforoNuevo}, en ${plural(i.clasesSobreAforo, 'clase hay', 'clases hay')} más confirmadas que plazas. No se mueven a lista de espera solas.`,
    });
  }

  if (out.length === 0) {
    out.push({
      tono: 'calma',
      texto: avisa
        ? 'Ninguna alumna está apuntada a estas clases: no se avisa a nadie.'
        : 'Este cambio no genera avisos a las alumnas.',
    });
  } else if (!avisa) {
    out.push({ tono: 'calma', texto: 'Este cambio no genera avisos a las alumnas.' });
  }
  return out;
}

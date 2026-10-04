// «Clase fija» en la ficha de una clase: qué enseña el interruptor y qué abre al tocarlo. Puro y sin `@/` (lo leen la pantalla y
// los tests del runner de Node).
//
// Es el ÚNICO camino de la alumna para hacer suya una clase que se repite (4-oct-2026: antes había una página «Clases fijas»,
// una ficha aparte y clases fijas con nombre, y el estudio y sus alumnas se perdían). Una franja = una clase fija: martes y
// jueves son dos interruptores, como en TIMP («reserva automática») o bsport («recurrent booking»).
//
// ⚠️ Nada de aquí DECIDE ni promete: el servidor lo vuelve a comprobar todo al pedir y al dejar. Y el interruptor solo cambia con
// lo que CONTESTA el servidor (`trasPedirla`, `trasDejarla`, `trasAnularla`), nunca al tocarlo.

import type { ClaseSueltaVista } from './clases-fijas.ts';
import { plazaFijaViva, type PlazaFijaMin } from './plaza-fija.ts';

export type AccionAuto =
  /** Pedir la clase fija de esta franja (con su duración). */
  | { tipo: 'PEDIR'; sesionId: string }
  /** Sin cuota que la cubra: no hay clase fija. La ficha ofrece, aparte, reservar varias semanas con el bono. */
  | { tipo: 'SOLO_CON_CUOTA' };

export interface EstadoAutoReservable {
  visual: 'apagado' | 'encendido' | 'pendiente';
  /** La próxima clase de la franja: por ahí se pide. */
  sesionId: string;
  /** Tipo y sala de la franja, para decir qué deja en la confirmación. */
  tipo: string | null;
  sala: string;
  /** Encendido: la plaza que se deja al apagarlo. `null` = aún no está en los datos (recién dada): se busca al tocar. */
  plaza: { id: string; deClaseFija: boolean } | null;
  /** Pendiente: la petición que se anula. */
  peticionId: string | null;
  /** Apagado: qué abre el toque. `null` = nada que hacer aquí. */
  accion: AccionAuto | null;
}

export interface DatosAutoReservable {
  sueltas: ClaseSueltaVista[];
  /** Sus plazas fijas (las del payload de la alumna): su plaza en esta franja es lo que de verdad reserva cada semana. */
  plazas?: PlazaFijaMin[];
}

/** `null` = esta clase no se repite o el estudio no deja pedirla desde la app: no se pinta nada. */
export function autoReservableDe(
  fijas: DatosAutoReservable | null | undefined,
  clase: { fecha: string; hora: string; salaId: string },
  hoy: string,
): EstadoAutoReservable | null {
  if (!fijas || !Array.isArray(fijas.sueltas)) return null;
  const dia = new Date(`${clase.fecha}T12:00:00Z`).getUTCDay();
  const hora = clase.hora.slice(0, 5);
  const franja = fijas.sueltas.find((f) =>
    f.diaSemana === dia && f.hora.slice(0, 5) === hora && f.salaId === clase.salaId && !!f.proximaSesionId) ?? null;
  if (!franja) return null;

  const base: EstadoAutoReservable = {
    visual: 'apagado', sesionId: franja.proximaSesionId, tipo: franja.tipo || null, sala: franja.sala ?? '',
    plaza: null, peticionId: null, accion: null,
  };
  // Su plaza en esta franja manda (también la que salió de una clase fija con nombre, de antes de retirarlas).
  const plaza = (fijas.plazas ?? []).find((p) => !!p.id && plazaFijaViva(p, hoy)
    && p.diaSemana === dia && p.horaInicio.slice(0, 5) === hora && p.salaId === clase.salaId);
  if (plaza?.id) return { ...base, visual: 'encendido', plaza: { id: plaza.id, deClaseFija: !!plaza.claseFijaId } };

  switch (franja.estado.estado) {
    case 'TIENE_PLAZA': return { ...base, visual: 'encendido' };
    case 'PEDIDA': return { ...base, visual: 'pendiente', peticionId: franja.estado.peticionId };
    case 'SOLO_CON_CUOTA': return { ...base, accion: { tipo: 'SOLO_CON_CUOTA' } };
    case 'PUEDE_PEDIR': return { ...base, accion: { tipo: 'PEDIR', sesionId: franja.proximaSesionId } };
    default: return null;
  }
}

/** Apagado y listo para volver a pedirla. */
function apagadoParaPedir(e: EstadoAutoReservable): EstadoAutoReservable {
  return { ...e, visual: 'apagado', plaza: null, peticionId: null, accion: { tipo: 'PEDIR', sesionId: e.sesionId } };
}

/**
 * Lo que contestó el servidor al pedirla. `resuelta` = la ha dado ya (aprobación automática): encendido. Si no, queda una petición
 * pendiente (con su id, para poder anularla). Una respuesta sin id ni `resuelta` es la de siempre de una plaza ya dada: encendido.
 */
export function trasPedirla(e: EstadoAutoReservable, r: { solicitudId: string | null; resuelta?: boolean }): EstadoAutoReservable {
  if (r.resuelta || !r.solicitudId) return { ...e, visual: 'encendido', plaza: null, peticionId: null, accion: null };
  return { ...e, visual: 'pendiente', plaza: null, peticionId: r.solicitudId, accion: null };
}

/** El servidor dice que la ha dejado: apagado, y se puede volver a pedir. */
export const trasDejarla = apagadoParaPedir;

/** El servidor dice que ha anulado la petición: apagado, y se puede volver a pedir. */
export const trasAnularla = apagadoParaPedir;

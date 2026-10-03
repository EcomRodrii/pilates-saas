// «Auto reservable» en la ficha de una clase normal: qué enseña el interruptor y qué abre al tocarlo. Puro y sin `@/` (lo leen la
// pantalla y los tests del runner de Node).
//
// La clase puede ser una franja SUELTA que se repite (se pide su plaza fija) o ir dentro de una clase fija CON NOMBRE (se pide la
// oferta entera, con sus duraciones). Desde «Ofrécelas en un clic» lo segundo será lo normal, así que el interruptor tiene que
// funcionar igual en los dos casos: nada de mandar a otra pantalla.
//
// ⚠️ Nada de aquí DECIDE ni promete: el servidor lo vuelve a comprobar todo al pedir y al dejar. Y el interruptor solo cambia con
// lo que CONTESTA el servidor (`trasPedirla`, `trasDejarla`, `trasAnularla`), nunca al tocarlo.

import type { ClaseFijaVista, ClaseSueltaVista } from './clases-fijas.ts';
import { plazaFijaViva, type PlazaFijaMin } from './plaza-fija.ts';

export type AccionAuto =
  /** Pedir la plaza fija de esta franja suelta (con su duración). */
  | { tipo: 'PEDIR_SUELTA'; sesionId: string }
  /** Pedir la clase fija con nombre en la que va esta clase (entera, con las duraciones de la oferta). */
  | { tipo: 'PEDIR_OFERTA'; ofertaId: string }
  /** Sin cuota que la cubra: no hay clase fija, pero sí reservar las próximas clases con su bono. */
  | { tipo: 'SOLO_BONO' }
  /** La clase fija con nombre no se puede pedir ahora mismo: se dice por qué y el interruptor no se toca. */
  | { tipo: 'NO_DISPONIBLE'; motivo: 'COMPLETA' | 'SIN_CLASES' };

export interface EstadoAutoReservable {
  visual: 'apagado' | 'encendido' | 'pendiente';
  /** La próxima clase de la franja: por ahí se pide una plaza suelta. */
  sesionId: string;
  /** La clase fija con nombre en la que va esta clase, si va en una. */
  oferta: ClaseFijaVista | null;
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
  ofertas: ClaseFijaVista[];
  sueltas: ClaseSueltaVista[];
  /** Sus plazas fijas (las del payload de la alumna): su plaza en esta franja es lo que de verdad reserva cada semana. */
  plazas?: PlazaFijaMin[];
}

/** `null` = esta clase no se repite o el estudio no la ofrece como clase fija: no se pinta nada. */
export function autoReservableDe(
  fijas: DatosAutoReservable | null | undefined,
  clase: { fecha: string; hora: string; salaId: string },
  hoy: string,
): EstadoAutoReservable | null {
  if (!fijas || !Array.isArray(fijas.sueltas) || !Array.isArray(fijas.ofertas)) return null;
  const dia = new Date(`${clase.fecha}T12:00:00Z`).getUTCDay();
  const hora = clase.hora.slice(0, 5);
  const coincide = (f: { diaSemana: number; hora: string; salaId: string; proximaSesionId?: string }) =>
    f.diaSemana === dia && f.hora.slice(0, 5) === hora && f.salaId === clase.salaId && !!f.proximaSesionId;

  const suelta = fijas.sueltas.find(coincide) ?? null;
  const oferta = suelta ? null : fijas.ofertas.find((o) => o.franjas.some(coincide)) ?? null;
  const franja = suelta ?? oferta?.franjas.find(coincide) ?? null;
  if (!franja) return null;

  const base: EstadoAutoReservable = {
    visual: 'apagado', sesionId: franja.proximaSesionId, oferta, tipo: franja.tipo || null, sala: franja.sala ?? '',
    plaza: null, peticionId: null, accion: null,
  };
  const sesionId = franja.proximaSesionId;
  // Su plaza en esta franja manda: también la de una clase fija con nombre (que el catálogo de sueltas no ve).
  const plaza = (fijas.plazas ?? []).find((p) => !!p.id && plazaFijaViva(p, hoy)
    && p.diaSemana === dia && p.horaInicio.slice(0, 5) === hora && p.salaId === clase.salaId);
  if (plaza?.id) return { ...base, visual: 'encendido', plaza: { id: plaza.id, deClaseFija: !!plaza.claseFijaId } };

  if (suelta) {
    switch (suelta.estado.estado) {
      case 'TIENE_PLAZA': return { ...base, visual: 'encendido' };
      case 'PEDIDA': return { ...base, visual: 'pendiente', peticionId: suelta.estado.peticionId };
      case 'SOLO_CON_CUOTA': return { ...base, accion: { tipo: 'SOLO_BONO' } };
      case 'PUEDE_PEDIR': return { ...base, accion: { tipo: 'PEDIR_SUELTA', sesionId } };
      default: return null;
    }
  }

  const o = oferta as ClaseFijaVista;
  if (o.estadoAlumna === 'LA_TIENE') return { ...base, visual: 'encendido' };
  if (o.pedida) return { ...base, visual: 'pendiente', peticionId: o.pedida.solicitudId };
  if (!o.tieneCuota) return { ...base, accion: { tipo: 'SOLO_BONO' } };
  if (o.estado === 'COMPLETA') return { ...base, accion: { tipo: 'NO_DISPONIBLE', motivo: 'COMPLETA' } };
  if (o.estado === 'SIN_CLASES' || o.duraciones.length === 0) return { ...base, accion: { tipo: 'NO_DISPONIBLE', motivo: 'SIN_CLASES' } };
  return { ...base, accion: { tipo: 'PEDIR_OFERTA', ofertaId: o.id } };
}

/** Apagado y listo para volver a pedirla: la suelta o la oferta entera, según de dónde venga. */
function apagadoParaPedir(e: EstadoAutoReservable): EstadoAutoReservable {
  return {
    ...e, visual: 'apagado', plaza: null, peticionId: null,
    accion: e.oferta ? { tipo: 'PEDIR_OFERTA', ofertaId: e.oferta.id } : { tipo: 'PEDIR_SUELTA', sesionId: e.sesionId },
  };
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

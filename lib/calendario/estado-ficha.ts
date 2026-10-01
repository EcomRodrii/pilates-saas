// ─────────────────────────────────────────────────────────────────────────────
// Lo que dice la ficha de una clase debajo de su hora: en qué punto está
// («En curso · acaba en 40 min», «Terminada · falta pasar lista») y la cifra
// que importa en ese momento («4 de 6 han venido», «5 de 6 plazas»).
//
// Antes el panel decía «Programada» o «Finalizada» y una barra de ocupación en
// cualquier momento; en el mostrador lo que importa durante la clase es cuántas
// han llegado, y al terminar, cuántas faltan por marcar.
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoSesion } from '../calendario-estado.ts';
import { faltaTexto } from '../calendario-metricas.ts';
import type { MarcaClase } from './marca-clase.ts';
import { textoAusencia, type AusenciaDeClase } from './ausencias.ts';

export interface PastillaEstado {
  texto: string;
  tono: 'exito' | 'aviso' | 'peligro' | 'neutro';
  punto?: boolean;
}

export interface DatosEstadoFicha {
  estado: EstadoSesion;
  inicio: string;
  fin: string;
  marca: MarcaClase;
  /** Con plaza: confirmadas + asistidas. */
  apuntadas: number;
  asistidas: number;
  /** Confirmadas sin check-in (las que quedan por marcar). */
  sinMarcar: number;
  aforo: number;
  enEspera: number;
}

/** Cuánto falta para un instante, en palabras: «en 20 min», «en 1 h 10». */
function enCuanto(iso: string, ahora: Date): string {
  return faltaTexto(Math.max(1, Math.round((Date.parse(iso) - ahora.getTime()) / 60_000)));
}

export function estadoDeFicha(d: DatosEstadoFicha, ahora: Date): { pastilla: PastillaEstado | null; cifra: string | null } {
  const plazas = `${d.apuntadas} de ${d.aforo} plazas${d.enEspera > 0 ? ` · ${d.enEspera} en espera` : ''}`;
  switch (d.estado) {
    case 'CANCELADA':
      return { pastilla: { texto: 'Cancelada', tono: 'neutro' }, cifra: null };
    case 'EN_CURSO':
      return {
        pastilla: { texto: `En curso · acaba ${enCuanto(d.fin, ahora)}`, tono: 'exito', punto: true },
        cifra: `${d.asistidas} de ${d.apuntadas} ${d.asistidas === 1 ? 'ha venido' : 'han venido'}`,
      };
    case 'SIN_PASAR_LISTA':
      return { pastilla: { texto: 'Terminada · falta pasar lista', tono: 'aviso' }, cifra: `${d.sinMarcar} sin marcar` };
    case 'FINALIZADA':
      return {
        pastilla: { texto: 'Terminada', tono: 'neutro' },
        cifra: d.apuntadas === 0 ? 'Sin clientas' : `${d.asistidas} de ${d.apuntadas} ${d.asistidas === 1 ? 'vino' : 'vinieron'}`,
      };
    case 'SIN_INSTRUCTORA':
      if (Date.parse(d.fin) > ahora.getTime()) {
        return { pastilla: { texto: d.marca.aviso?.texto ?? 'Sin cubrir', tono: 'peligro' }, cifra: plazas };
      }
      return { pastilla: { texto: 'Terminada', tono: 'neutro' }, cifra: `${d.asistidas} de ${d.apuntadas} vinieron` };
    case 'INCIDENCIA':
      return { pastilla: { texto: 'Incidencia', tono: 'peligro' }, cifra: plazas };
    case 'CONFLICTO':
      return { pastilla: { texto: 'Choca con otra clase', tono: 'peligro' }, cifra: plazas };
    default: {
      const min = (Date.parse(d.inicio) - ahora.getTime()) / 60_000;
      const pronto = min > 0 && min <= 120;
      return { pastilla: pronto ? { texto: `Empieza ${enCuanto(d.inicio, ahora)}`, tono: 'neutro' } : null, cifra: plazas };
    }
  }
}

const fmtDiaMes = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «del 2 al 9 de octubre» de dos fechas 'YYYY-MM-DD'. */
export function rangoDeFechas(desde: string, hasta: string): string {
  const d = new Date(`${desde}T12:00:00Z`);
  const h = new Date(`${hasta}T12:00:00Z`);
  if (desde === hasta) return `el ${fmtDiaMes.format(d)}`;
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  return mismoMes ? `del ${d.getUTCDate()} al ${fmtDiaMes.format(h)}` : `del ${fmtDiaMes.format(d)} al ${fmtDiaMes.format(h)}`;
}

/** Por qué la clase no tiene quien la dé, en una frase para la ficha. */
export function porQueSinCubrir(d: {
  instructora: string | null;
  ausencia: AusenciaDeClase | null;
  instructoraInactiva: boolean;
  motivoBaja: string | null;
  sustitucionAbierta: boolean;
}): string | null {
  const quien = d.instructora ?? 'Su instructora';
  if (d.sustitucionAbierta) return `${quien} no puede darla${d.motivoBaja ? `: ${d.motivoBaja}` : ''}.`;
  if (d.ausencia) {
    const cuando = d.ausencia.tipo === 'OTRO' && d.ausencia.desde === d.ausencia.hasta ? 'ese día' : rangoDeFechas(d.ausencia.desde, d.ausencia.hasta);
    return `La da ${quien}, que ${d.ausencia.tipo === 'OTRO' ? 'no está disponible' : `está ${textoAusencia(d.ausencia.tipo)}`} ${cuando}.`;
  }
  if (d.instructoraInactiva) return 'Quien la daba ya no está en el equipo.';
  return null;
}

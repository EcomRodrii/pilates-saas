// ─────────────────────────────────────────────────────────────────────────────
// Lo que dice una clase en la rejilla, además de su hora y su nombre.
//
// UNA marca por clase, la más importante del momento: «Sin cubrir» gana a
// «floja», «Pasar lista» a «5 vinieron». Antes la rejilla dejaba que el color
// del estado hablara solo, y el color no dice POR QUÉ: una clase ámbar podía
// ser «falta pasar lista» o «sin instructora», y había que abrirla para saberlo.
//
// Y las cifras de la línea de resumen («2 sin cubrir · 3 flojas…»), que salen de
// las mismas clases con la misma regla: si la línea dice «2 sin cubrir», al
// tocarla se iluminan exactamente esas dos.
//
// Puro: el estado ya llega decidido (`estadoSesion`, lib/calendario-estado.ts).
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoSesion } from '../calendario-estado.ts';
import { faltaTexto } from '../calendario-metricas.ts';
import { textoAusencia, type TipoAusencia } from './ausencias.ts';

export type TipoAviso =
  | 'cancelada' | 'sin-cubrir' | 'buscando' | 'incidencia' | 'conflicto'
  | 'pasar-lista' | 'en-curso' | 'lista-pasada' | 'siguiente';

export type TipoExtra = 'floja' | 'espera' | 'llena' | 'fijas';

export interface MarcaClase {
  /** Lo que ocupa la segunda línea en lugar de (o delante de) quién la da. */
  aviso: { tipo: TipoAviso; texto: string; corto: string; detalle?: string } | null;
  /** Lo que va a la derecha cuando no hay aviso. */
  extra: { tipo: TipoExtra; texto: string } | null;
}

export interface DatosMarca {
  estado: EstadoSesion;
  inicio: string;
  fin: string;
  /** El nombre que se enseña (ya resuelto: «No disponible» para quien está de baja). */
  instructora: string | null;
  sustitucionEstado?: string | null;
  ausencia?: { tipo: TipoAusencia } | null;
  instructoraInactiva?: boolean;
  incidenciaTexto?: string | null;
  confirmadas: number;
  asistidas: number;
  noVinieron: number;
  enEspera: number;
  aforo: number;
  fijas: number;
  floja: boolean;
  /** La próxima clase de hoy que todavía no ha empezado. */
  esSiguiente: boolean;
}

/** «La siguiente» solo se anuncia si empieza pronto: más allá, es una clase más. */
export const SIGUIENTE_HASTA_MIN = 120;

export function primerNombre(nombre: string | null): string {
  return nombre?.trim().split(/\s+/)[0] ?? '';
}

function conQuien(texto: string, instructora: string | null): string {
  const quien = primerNombre(instructora);
  return quien ? `${texto} · ${quien}` : texto;
}

/** Por qué una clase está sin instructora, en sus palabras. */
function avisoSinInstructora(d: DatosMarca): NonNullable<MarcaClase['aviso']> {
  const s = d.sustitucionEstado;
  if (s === 'buscando' || s === 'contactando') {
    return { tipo: 'buscando', texto: 'Buscando sustituta', corto: 'Buscando' };
  }
  if (s === 'pendiente_aprobacion') {
    return { tipo: 'sin-cubrir', texto: 'Espera tu visto bueno', corto: 'Por aprobar', detalle: 'Hay que aprobar a quién se avisa para sustituirla' };
  }
  if (s === 'agotada') {
    return { tipo: 'sin-cubrir', texto: 'Nadie ha aceptado', corto: 'Sin cubrir', detalle: 'Se avisó a todas las candidatas y ninguna la ha cogido' };
  }
  const porque = d.ausencia
    ? `Sin instructora · ${textoAusencia(d.ausencia.tipo)}`
    : d.instructoraInactiva ? 'Sin instructora · ya no está en el equipo' : 'Sin instructora';
  return { tipo: 'sin-cubrir', texto: 'Sin cubrir', corto: 'Sin cubrir', detalle: porque };
}

export function marcaDeClase(d: DatosMarca, ahora: Date): MarcaClase {
  const fin = new Date(d.fin).getTime();
  const terminada = ahora.getTime() >= fin;

  switch (d.estado) {
    case 'CANCELADA':
      return { aviso: { tipo: 'cancelada', texto: 'Cancelada', corto: 'Cancelada' }, extra: null };
    case 'SIN_INSTRUCTORA':
      // Una clase que ya pasó sin instructora no pide nada: se cuenta como lo que fue.
      if (!terminada) return { aviso: avisoSinInstructora(d), extra: null };
      break;
    case 'INCIDENCIA': {
      const texto = d.incidenciaTexto?.trim() || 'Incidencia';
      return { aviso: { tipo: 'incidencia', texto, corto: 'Incidencia', detalle: texto }, extra: null };
    }
    case 'CONFLICTO':
      return { aviso: { tipo: 'conflicto', texto: 'Choca con otra clase', corto: 'Choca', detalle: 'La sala o la instructora ya tienen otra clase a esa hora' }, extra: null };
    case 'SIN_PASAR_LISTA':
      return { aviso: { tipo: 'pasar-lista', texto: 'Pasar lista', corto: 'Pasar lista' }, extra: null };
    case 'EN_CURSO':
      return { aviso: { tipo: 'en-curso', texto: conQuien('En curso', d.instructora), corto: 'En curso' }, extra: null };
    default:
      break;
  }

  if (terminada) {
    if (d.asistidas > 0) {
      const texto = d.asistidas === 1 ? '1 vino' : `${d.asistidas} vinieron`;
      return { aviso: { tipo: 'lista-pasada', texto, corto: texto }, extra: null };
    }
    if (d.noVinieron > 0) return { aviso: { tipo: 'lista-pasada', texto: 'No vino nadie', corto: 'Nadie' }, extra: null };
    return { aviso: null, extra: null };
  }

  if (d.esSiguiente) {
    const min = Math.round((new Date(d.inicio).getTime() - ahora.getTime()) / 60_000);
    if (min > 0 && min <= SIGUIENTE_HASTA_MIN) {
      const falta = faltaTexto(min);
      return { aviso: { tipo: 'siguiente', texto: conQuien(falta, d.instructora), corto: falta }, extra: null };
    }
  }

  return { aviso: null, extra: extraDeClase(d) };
}

function extraDeClase(d: DatosMarca): MarcaClase['extra'] {
  if (d.floja) return { tipo: 'floja', texto: 'floja' };
  if (d.enEspera > 0) return { tipo: 'espera', texto: `+${d.enEspera} en espera` };
  if (d.aforo > 0 && d.confirmadas >= d.aforo) return { tipo: 'llena', texto: 'llena' };
  if (d.fijas > 0) return { tipo: 'fijas', texto: d.fijas === 1 ? '1 fija' : `${d.fijas} fijas` };
  return null;
}

// ─── La línea de resumen ─────────────────────────────────────────────────────

export type FiltroResumen = 'sin-cubrir' | 'pasar-lista' | 'conflictos' | 'incidencias' | 'flojas' | 'espera' | 'sobreaforo';

export interface ClaseParaResumen {
  id: string;
  estado: EstadoSesion;
  cancelada: boolean;
  /** Ya terminó (ahora >= fin). */
  terminada: boolean;
  floja: boolean;
  enEspera: number;
  confirmadas: number;
  aforo: number;
  /** Más plazas que la capacidad de su sala. */
  sobreaforo: boolean;
}

/** ¿Esta clase cuenta en esa cifra? La misma regla para contar y para resaltar. */
export function claseEnFiltro(c: ClaseParaResumen, f: FiltroResumen): boolean {
  if (c.cancelada) return false;
  switch (f) {
    case 'sin-cubrir': return c.estado === 'SIN_INSTRUCTORA' && !c.terminada;
    case 'pasar-lista': return c.estado === 'SIN_PASAR_LISTA';
    case 'conflictos': return c.estado === 'CONFLICTO';
    case 'incidencias': return c.estado === 'INCIDENCIA';
    case 'flojas': return c.floja && !c.terminada;
    case 'espera': return c.enEspera > 0 && !c.terminada;
    case 'sobreaforo': return c.sobreaforo && !c.terminada;
  }
}

const ORDEN: FiltroResumen[] = ['sin-cubrir', 'pasar-lista', 'conflictos', 'incidencias', 'flojas', 'espera', 'sobreaforo'];

function textoCifra(f: FiltroResumen, n: number): string {
  const uno = n === 1;
  switch (f) {
    case 'sin-cubrir': return 'sin cubrir';
    case 'pasar-lista': return 'por pasar lista';
    case 'conflictos': return uno ? 'choca con otra clase' : 'chocan con otras clases';
    case 'incidencias': return uno ? 'incidencia' : 'incidencias';
    case 'flojas': return uno ? 'floja' : 'flojas';
    case 'espera': return 'con lista de espera';
    case 'sobreaforo': return 'con más plazas que su sala';
  }
}

export interface ResumenVista {
  clases: number;
  /** 0..1 sobre las clases no canceladas; null sin clases. */
  ocupacion: number | null;
  cifras: { filtro: FiltroResumen; n: number; texto: string }[];
}

export function resumenDeVista(clases: readonly ClaseParaResumen[]): ResumenVista {
  const vivas = clases.filter(c => !c.cancelada);
  const plazas = vivas.reduce((a, c) => a + c.aforo, 0);
  const ocupadas = vivas.reduce((a, c) => a + Math.min(c.confirmadas, c.aforo), 0);
  const cifras = ORDEN.flatMap(filtro => {
    const n = vivas.filter(c => claseEnFiltro(c, filtro)).length;
    return n > 0 ? [{ filtro, n, texto: textoCifra(filtro, n) }] : [];
  });
  return { clases: vivas.length, ocupacion: plazas > 0 ? ocupadas / plazas : null, cifras };
}

/** «54 clases · 61 % de ocupación». */
export function textoResumen(r: ResumenVista): string {
  if (r.clases === 0) return 'Sin clases';
  const clases = r.clases === 1 ? '1 clase' : `${r.clases} clases`;
  return r.ocupacion == null ? clases : `${clases} · ${Math.round(r.ocupacion * 100)} % de ocupación`;
}

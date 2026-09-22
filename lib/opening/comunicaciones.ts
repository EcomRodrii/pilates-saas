import type { DestinatariosCampana } from '../types.ts';
import { SEGMENTOS_AUDIENCIA } from '../marketing/segmentos.ts';
import { NOMBRE_ETAPA, type EtapaVista } from './etapas.ts';
import { LEGAL } from '../legal-info.ts';

// Atajos de Opening OS a Mensajería: la tarjeta de apertura PROPONE el envío
// (a quién y con qué texto) y Mensajería lo manda como cualquier campaña, con
// su filtro de consentimiento, su enlace de baja y su registro. Nada sale sin
// que la propietaria lo revise y pulse «Enviar». No hay motor nuevo.

export interface BorradorMensajeria {
  segmento: DestinatariosCampana;
  asunto: string;
  mensaje: string;
}

const SEGMENTOS_FIJOS = new Set<string>(SEGMENTOS_AUDIENCIA.map(s => s.id));
const MAX_TEXTO = 2000;

/** El segmento que llega por URL, solo si tiene una forma que el motor de campañas entiende. */
function segmentoValido(s: string | null): DestinatariosCampana | null {
  if (!s) return null;
  if (SEGMENTOS_FIJOS.has(s)) return s as DestinatariosCampana;
  if (/^ETAPA:[A-Z_]+$/.test(s)) return s as DestinatariosCampana;
  if (/^ETIQUETA:[\p{L}\p{N} _.-]{1,60}$/u.test(s)) return s as DestinatariosCampana;
  return null;
}

/** Enlace absoluto a la página de reservas del estudio, para el texto del correo (solo en el navegador). */
export function enlaceReservas(slug: string): string {
  const origen = typeof window !== 'undefined' ? window.location.origin : LEGAL.url;
  return `${origen}/reservar/${encodeURIComponent(slug)}`;
}

export function hrefMensajeria(b: BorradorMensajeria): string {
  const p = new URLSearchParams({ segmento: b.segmento, asunto: b.asunto, mensaje: b.mensaje });
  return `/mensajeria?${p.toString()}`;
}

/** Lo que Mensajería rellena al abrir desde un atajo. null si la URL no trae un borrador válido. */
export function leerBorradorMensajeria(search: string): BorradorMensajeria | null {
  const p = new URLSearchParams(search);
  const segmento = segmentoValido(p.get('segmento'));
  if (!segmento) return null;
  return {
    segmento,
    asunto: (p.get('asunto') ?? '').slice(0, 200),
    mensaje: (p.get('mensaje') ?? '').slice(0, MAX_TEXTO),
  };
}

/** Con cuántos días de antelación se propone recordar que una etapa termina. */
export const DIAS_AVISO_FIN_ETAPA = 3;

/** Días (del estudio) que le quedan a una etapa abierta, contando hoy; null si no está en curso. */
export function diasParaFinEtapa(e: Pick<EtapaVista, 'desde' | 'hasta' | 'cerrada'>, hoy: string): number | null {
  if (e.cerrada || hoy < e.desde || hoy > e.hasta) return null;
  return Math.round((Date.parse(`${e.hasta}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

/** ¿Merece proponer el recordatorio? En los últimos días y con plazas por vender. */
export function tocaRecordarFinEtapa(e: Pick<EtapaVista, 'desde' | 'hasta' | 'cerrada' | 'limitePlazas' | 'ventas'>, hoy: string): boolean {
  const d = diasParaFinEtapa(e, hoy);
  if (d === null || d > DIAS_AVISO_FIN_ETAPA) return false;
  return e.limitePlazas === null || e.ventas < e.limitePlazas;
}

const fechaLarga = (f: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  .format(new Date(`${f}T00:00:00Z`));

/** A las interesadas: la venta de esta etapa está abierta. */
export function borradorVentaEtapa(e: Pick<EtapaVista, 'etapa' | 'planNombre' | 'hasta' | 'limitePlazas'>, nombreEstudio: string, enlaceReservas: string): BorradorMensajeria {
  const nombre = NOMBRE_ETAPA[e.etapa];
  const plazas = e.limitePlazas !== null ? ` Hay ${e.limitePlazas} plazas.` : '';
  return {
    segmento: 'ETAPA:INTERESADA',
    asunto: `${nombreEstudio}: ya puedes conseguir tu plaza ${nombre.toLowerCase()}`,
    mensaje: `Hola:\n\nYa está abierta la etapa ${nombre}${e.planNombre ? ` con «${e.planNombre}»` : ''}, hasta el ${fechaLarga(e.hasta)}.${plazas}\n\nPuedes hacerte con la tuya aquí: ${enlaceReservas}\n\nTe esperamos.`,
  };
}

/** A las interesadas: la etapa se acaba y quedan plazas. */
export function borradorFinEtapa(e: Pick<EtapaVista, 'etapa' | 'planNombre' | 'hasta' | 'limitePlazas' | 'ventas'>, nombreEstudio: string, enlaceReservas: string): BorradorMensajeria {
  const nombre = NOMBRE_ETAPA[e.etapa];
  const quedan = e.limitePlazas !== null ? ` Quedan ${Math.max(0, e.limitePlazas - e.ventas)} plazas.` : '';
  return {
    segmento: 'ETAPA:INTERESADA',
    asunto: `${nombreEstudio}: la etapa ${nombre} termina el ${fechaLarga(e.hasta)}`,
    mensaje: `Hola:\n\nLa etapa ${nombre}${e.planNombre ? ` («${e.planNombre}»)` : ''} termina el ${fechaLarga(e.hasta)}.${quedan}\n\nSi quieres la tuya, es aquí: ${enlaceReservas}`,
  };
}

/** A las invitadas de la apertura suave. */
export function borradorInvitadas(fechaApertura: string, nombreEstudio: string, enlaceReservas: string): BorradorMensajeria {
  return {
    segmento: 'ETIQUETA:apertura-suave',
    asunto: `${nombreEstudio}: estás invitada a nuestra apertura suave`,
    mensaje: `Hola:\n\nAntes de abrir a todo el mundo el ${fechaLarga(fechaApertura)}, abrimos unos días solo para ti y unas pocas personas más. Ya puedes reservar tu clase aquí: ${enlaceReservas}\n\nNos hace mucha ilusión verte.`,
  };
}

/**
 * Pura: ¿toca hoy el «abrimos mañana»? Solo si la propietaria lo encendió, la
 * apertura es MAÑANA y la fecha es exacta: con una fecha aproximada («hacia
 * noviembre») decirle a nadie «mañana abrimos» sería mentir.
 */
export function tocaAvisarAbrimos(p: { encendido: boolean; diasHastaApertura: number | null; fechaAproximada: boolean }): boolean {
  return p.encendido && p.diasHastaApertura === 1 && !p.fechaAproximada;
}

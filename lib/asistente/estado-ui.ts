// El estado del panel del asistente en el navegador: un reductor PURO sobre los
// eventos del stream (lib/asistente/protocolo.ts), para poder probarlo con
// `node --test` sin React ni red. Lo usa components/asistente/use-asistente.ts.
//
// También decide el «momento» de Tenti (spec §5.3): qué cara pone en la
// cabecera mientras se espera, se consulta, se responde, se termina, se pide
// una aclaración o algo falla. La traducción a estados del motor vive en
// lib/tenti/asistente.ts (la vigila la guardia de Tenti).

import type { CodigoAviso, EventoAsistente, MotivoFin } from './protocolo.ts';
import type { BloqueAsistente } from './tipos.ts';

export type MomentoAsistente = 'listo' | 'esperando' | 'consultando' | 'respondiendo' | 'terminado' | 'aclarando' | 'fallo';

export type CodigoErrorUI =
  | 'SIN_SALDO' | 'TOPE_DIA' | 'RAFAGA' | 'NO_DISPONIBLE' | 'IA' | 'RED' | 'LLENA' | 'OTRA_EN_CURSO' | 'PLAN' | 'INTERNO';

export interface ErrorUI {
  codigo: CodigoErrorUI;
  mensaje: string;
  /** «Reintentar» hace la misma pregunta otra vez (una pregunta nueva). */
  reintentar: boolean;
  /** «Empezar una conversación nueva». */
  nueva: boolean;
}

export interface Referencia { nombre: string; href: string | null }

export interface TurnoUI {
  id: string;
  pregunta: string;
  /** Lo que se ve debajo de la pregunta mientras trabaja: «Mirando la agenda del martes 6…». */
  estado: string | null;
  texto: string;
  bloques: { id: string; bloque: BloqueAsistente }[];
  avisos: CodigoAviso[];
  fase: 'enviando' | 'recibiendo' | 'hecho' | 'error';
  error: ErrorUI | null;
  motivo: MotivoFin | null;
}

export interface EstadoAsistente {
  conversacionId: string | null;
  turnos: TurnoUI[];
  referencias: Record<string, Referencia>;
  /** Consultas que quedan (null: aún no se sabe). */
  disponibles: number | null;
  momento: MomentoAsistente;
}

export const ESTADO_INICIAL: EstadoAsistente = { conversacionId: null, turnos: [], referencias: {}, disponibles: null, momento: 'listo' };

export type AccionAsistente =
  | { tipo: 'preguntar'; id: string; pregunta: string }
  | { tipo: 'evento'; e: EventoAsistente }
  | { tipo: 'fallo'; error: ErrorUI }
  /** El stream se acabó sin `fin` ni `error` (red cortada, panel cerrado). */
  | { tipo: 'cortado'; error: ErrorUI | null }
  /** El «hecho» breve vuelve a reposo. */
  | { tipo: 'reposo' }
  | { tipo: 'saldo'; disponibles: number }
  | { tipo: 'nueva' }
  | { tipo: 'cargar'; conversacionId: string; turnos: { pregunta: string; texto: string; bloques: BloqueAsistente[] }[]; referencias: Record<string, Referencia> };

const ultimo = (s: EstadoAsistente) => s.turnos[s.turnos.length - 1];

function conUltimo(s: EstadoAsistente, f: (t: TurnoUI) => TurnoUI): EstadoAsistente {
  const t = ultimo(s);
  if (!t) return s;
  return { ...s, turnos: [...s.turnos.slice(0, -1), f(t)] };
}

/** ¿Hay una pregunta en vuelo? (el campo se deshabilita y el botón dice aria-busy) */
export const enVuelo = (s: EstadoAsistente) => {
  const t = ultimo(s);
  return !!t && (t.fase === 'enviando' || t.fase === 'recibiendo');
};

export function reducirAsistente(s: EstadoAsistente, a: AccionAsistente): EstadoAsistente {
  switch (a.tipo) {
    case 'preguntar':
      return {
        ...s,
        momento: 'esperando',
        turnos: [...s.turnos, { id: a.id, pregunta: a.pregunta, estado: null, texto: '', bloques: [], avisos: [], fase: 'enviando', error: null, motivo: null }],
      };
    case 'fallo':
      return { ...conUltimo(s, t => ({ ...t, fase: 'error', estado: null, error: a.error })), momento: 'fallo' };
    case 'cortado': {
      const t = ultimo(s);
      if (!t || (t.fase !== 'enviando' && t.fase !== 'recibiendo')) return s;
      return { ...conUltimo(s, x => ({ ...x, fase: a.error ? 'error' : 'hecho', estado: null, error: a.error })), momento: a.error ? 'fallo' : 'listo' };
    }
    case 'reposo':
      return s.momento === 'terminado' ? { ...s, momento: 'listo' } : s;
    case 'saldo':
      return { ...s, disponibles: a.disponibles };
    case 'nueva':
      return { ...ESTADO_INICIAL, disponibles: s.disponibles };
    case 'cargar':
      return {
        ...s,
        conversacionId: a.conversacionId,
        referencias: a.referencias,
        momento: 'listo',
        turnos: a.turnos.map((t, i) => ({
          id: `previo-${i}`, pregunta: t.pregunta, estado: null, texto: t.texto,
          bloques: t.bloques.map((b, j) => ({ id: `previo-${i}-${j}`, bloque: b })),
          avisos: [], fase: 'hecho', error: null, motivo: null,
        })),
      };
    case 'evento':
      return conEvento(s, a.e);
  }
}

function conEvento(s: EstadoAsistente, e: EventoAsistente): EstadoAsistente {
  switch (e.t) {
    case 'inicio':
      return { ...conUltimo(s, t => ({ ...t, fase: 'recibiendo' })), conversacionId: e.conversacionId, disponibles: e.disponibles };
    case 'herramienta':
      return { ...conUltimo(s, t => ({ ...t, estado: e.etiqueta })), momento: 'consultando' };
    case 'bloque':
      // La tarjeta ya está: vuelve a pensar con lo que tiene.
      return { ...conUltimo(s, t => ({ ...t, bloques: [...t.bloques, { id: e.id, bloque: e.bloque }] })), momento: 'esperando' };
    case 'referencias':
      return { ...s, referencias: { ...s.referencias, ...e.refs } };
    case 'texto':
      return { ...conUltimo(s, t => ({ ...t, texto: t.texto + e.delta, estado: null })), momento: 'respondiendo' };
    case 'aviso':
      return conUltimo(s, t => (t.avisos.includes(e.codigo) ? t : { ...t, avisos: [...t.avisos, e.codigo] }));
    case 'fin': {
      const t = ultimo(s);
      const momento: MomentoAsistente = e.motivo === 'ACLARACION' ? 'aclarando' : t && t.bloques.length > 0 ? 'terminado' : 'listo';
      return { ...conUltimo(s, x => ({ ...x, fase: 'hecho', estado: null, motivo: e.motivo })), disponibles: e.disponibles, momento };
    }
    case 'error':
      return {
        ...conUltimo(s, t => ({
          ...t, fase: 'error', estado: null,
          error: { codigo: e.codigo === 'IA_NO_DISPONIBLE' ? 'IA' : 'INTERNO', mensaje: TEXTOS.IA, reintentar: true, nueva: false },
        })),
        momento: 'fallo',
      };
  }
}

// ── Los textos de error (spec §5.5): exactos y sin culpar ────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const TEXTOS = {
  IA: 'No he podido responder ahora. No se ha descontado ninguna consulta.',
  RED: 'Se ha cortado la conexión.',
  TOPE_DIA: 'Por hoy no puedo responder más. Mañana vuelvo a estar disponible.',
  RAFAGA: 'Vas muy rápido: espera unos segundos y vuelve a preguntar.',
  LLENA: 'Esta conversación ya es muy larga. Empieza una nueva para seguir.',
  OTRA_EN_CURSO: 'Ya estoy respondiendo otra pregunta en otra pestaña.',
  PLAN: 'Tu plan no incluye el asistente.',
  NO_DISPONIBLE: 'El asistente no está disponible ahora mismo.',
} as const;

/** «Vuelven el 1 de noviembre.»: el día 1 del mes siguiente al de `hoy` (YYYY-MM-DD, Madrid), o `renuevaEl` si llega. */
export function textoSinSaldo(hoy: string, saldo: { enPrueba?: boolean; renuevaEl?: string | null } | null): string {
  if (saldo?.enPrueba) return 'Has usado las consultas de tu prueba gratuita. Vuelven cada mes cuando elijas tu plan.';
  // Solo hace falta el MES: el día 1 del siguiente (o el de `renuevaEl`).
  const m = saldo?.renuevaEl && /^\d{4}-\d{2}-\d{2}/.test(saldo.renuevaEl)
    ? Number(saldo.renuevaEl.slice(5, 7))
    : (Number(hoy.slice(5, 7)) % 12) + 1;
  return `Has usado las consultas de este mes. Vuelven el 1 de ${MESES[m - 1]}.`;
}

/** Una respuesta no-200 de POST /api/asistente, en lo que ve la propietaria. */
export function errorDeRespuesta(
  status: number, cuerpo: { codigo?: string } | null, hoy: string, saldo: { enPrueba?: boolean; renuevaEl?: string | null } | null,
): ErrorUI {
  const c = cuerpo?.codigo;
  if (status === 429) {
    if (c === 'SIN_SALDO') return { codigo: 'SIN_SALDO', mensaje: textoSinSaldo(hoy, saldo), reintentar: false, nueva: false };
    if (c === 'TOPE_DIARIO_ESTUDIO' || c === 'TOPE_DIARIO_GLOBAL') return { codigo: 'TOPE_DIA', mensaje: TEXTOS.TOPE_DIA, reintentar: false, nueva: false };
    return { codigo: 'RAFAGA', mensaje: TEXTOS.RAFAGA, reintentar: true, nueva: false };
  }
  if (status === 409 && c === 'CONVERSACION_LLENA') return { codigo: 'LLENA', mensaje: TEXTOS.LLENA, reintentar: false, nueva: true };
  if (status === 409) return { codigo: 'OTRA_EN_CURSO', mensaje: TEXTOS.OTRA_EN_CURSO, reintentar: true, nueva: false };
  // Una conversación que ya no existe (purgada a los 90 días): se sigue en una nueva.
  if (status === 404 && c !== 'NO_DISPONIBLE') return { codigo: 'LLENA', mensaje: 'Esa conversación ya no está. Empieza una nueva para seguir.', reintentar: false, nueva: true };
  if (status === 404) return { codigo: 'NO_DISPONIBLE', mensaje: TEXTOS.NO_DISPONIBLE, reintentar: false, nueva: false };
  if (status === 403) return { codigo: 'PLAN', mensaje: TEXTOS.PLAN, reintentar: false, nueva: false };
  return { codigo: 'IA', mensaje: TEXTOS.IA, reintentar: true, nueva: false };
}

export const ERROR_DE_RED: ErrorUI = { codigo: 'RED', mensaje: TEXTOS.RED, reintentar: true, nueva: false };

// ── Las preguntas sugeridas (las del fundador), por rol ──────────────────────

export interface Sugerencia { texto: string; dinero: boolean }

/** Cada una se responde con UNA herramienta (una consulta). Las de dinero, solo a quien lo ve. */
export const SUGERENCIAS: readonly Sugerencia[] = [
  { texto: '¿Cuántas alumnas activas tengo?', dinero: false },
  { texto: '¿Qué clases hay mañana?', dinero: false },
  { texto: '¿Cuánto he facturado este mes?', dinero: true },
  { texto: '¿Qué debería revisar hoy?', dinero: false },
  { texto: '¿Quién lleva más de 30 días sin venir?', dinero: false },
  { texto: '¿Qué pagos tengo pendientes?', dinero: true },
  { texto: '¿Qué franja va peor este mes?', dinero: false },
  { texto: '¿Qué bonos caducan esta semana?', dinero: false },
  { texto: 'Hazme un resumen del estudio', dinero: false },
  { texto: 'Quiero hacer un taller: ¿qué día me conviene?', dinero: false },
];

export function sugerenciasPara(veDinero: boolean, n = SUGERENCIAS.length): string[] {
  return SUGERENCIAS.filter(s => veDinero || !s.dinero).slice(0, n).map(s => s.texto);
}

// ── El texto con referencias: `[ALUMNA_3]` como chip, importes aparte ────────

export type TrozoTexto = { tipo: 'texto'; texto: string } | { tipo: 'ref'; ref: string } | { tipo: 'euros'; texto: string };

const PATRON_TROZOS = /\[([A-Z]+_\d+)\]|(\d[\d.]*,\d{2}\s?€|\d[\d.]*\s?€)/g;

/** Parte el texto de la respuesta en trozos para pintarlo (las marcas y los importes). */
export function trocearTexto(texto: string): TrozoTexto[] {
  const out: TrozoTexto[] = [];
  let i = 0;
  for (const m of texto.matchAll(PATRON_TROZOS)) {
    if (m.index > i) out.push({ tipo: 'texto', texto: texto.slice(i, m.index) });
    out.push(m[1] ? { tipo: 'ref', ref: m[1] } : { tipo: 'euros', texto: m[2] });
    i = m.index + m[0].length;
  }
  if (i < texto.length) out.push({ tipo: 'texto', texto: texto.slice(i) });
  return out;
}

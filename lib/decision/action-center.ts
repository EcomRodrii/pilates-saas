// ─────────────────────────────────────────────────────────────────────────────
// Action Center — el Brain, en la pantalla donde la propietaria entra de verdad.
//
// El problema que resuelve no es de inteligencia, es de sitio. Todo el Decision
// OS vive en `/centro-de-control`: el Veredicto del Día, las prioridades, el
// seguimiento. Y `/dashboard` —1.300 líneas de métricas, la pantalla que se
// abre al entrar— no lo menciona en ningún sitio. Dos "inicios" compitiendo, y
// el que gana es el que no sabe nada.
//
// Esto NO es un motor nuevo: agrupa lo que `/api/decisiones` ya devuelve para
// que quepa en cinco líneas arriba del todo, con un enlace al detalle.
//
// Puro y sin I/O (ver action-center.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { severidad, type NivelSeveridad } from './severidad.ts';

/** Lo que la pantalla necesita de cada recomendación. Estructural a propósito:
 *  el hook del cliente (`RecomendacionAPI`) y el tipo del servidor
 *  (`Recomendacion`) encajan los dos sin convertir nada. */
export interface RecomendacionResumible {
  id: string;
  titulo: string;
  prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  riesgo: 'PERDIDA' | 'OPORTUNIDAD';
  confianza: { nivel: 'ALTA' | 'MEDIA' | 'BAJA' };
  impacto: { valor: number; unidad: string } | null;
  accion: { tipo: string };
  score: number;
}

export interface ItemAccion {
  id: string;
  titulo: string;
  severidad: NivelSeveridad;
  /**
   * true = con un toque lo hace Tentare (manda el email, el WhatsApp, cobra el
   * recibo). false = solo te lo cuenta; la acción es tuya.
   *
   * Sale del ejecutor real (F3, lib/inngest/decision.ts): al aprobar, todo
   * tipo de acción dispara algo de verdad EXCEPTO `MARCAR_GESTIONADO`, que es
   * informativo y no tiene efecto externo ninguno. No se deduce del piloto
   * automático: eso es otra cosa (si además lo hace SIN preguntar).
   */
  loHaceTentare: boolean;
}

export interface ResumenAccion {
  /** Lo que va a costar dinero si nadie lo toca. */
  atencion: ItemAccion[];
  /** Lo que puede ganar dinero si alguien lo aprovecha. */
  oportunidades: ItemAccion[];
  /**
   * € en juego, SEPARADOS por unidad a propósito: 89 €/mes de una cuota y 20 €
   * de una plaza suelta no se pueden sumar en la misma cifra sin mentir. Cada
   * uno se enseña con su unidad, o no se enseña.
   */
  eurMesEnRiesgo: number;
  eurPuntualEnRiesgo: number;
  eurMesOportunidad: number;
  eurPuntualOportunidad: number;
  /** Cuántas de las que necesitan atención se resuelven con un solo toque. */
  nUnToque: number;
  /** Sin nada que contar, la sección entera no se pinta. */
  vacio: boolean;
}

const ORDEN_SEVERIDAD: Record<NivelSeveridad, number> = { CRITICO: 0, IMPORTANTE: 1, RECOMENDACION: 2 };

function aItem(r: RecomendacionResumible): ItemAccion {
  return {
    id: r.id,
    titulo: r.titulo,
    severidad: severidad(r.prioridad, r.riesgo, r.confianza.nivel),
    loHaceTentare: r.accion.tipo !== 'MARCAR_GESTIONADO',
  };
}

/** Primero lo más grave; a igual gravedad, lo que el motor puntuó más alto. */
function ordenar(a: RecomendacionResumible, b: RecomendacionResumible): number {
  const sa = ORDEN_SEVERIDAD[severidad(a.prioridad, a.riesgo, a.confianza.nivel)];
  const sb = ORDEN_SEVERIDAD[severidad(b.prioridad, b.riesgo, b.confianza.nivel)];
  return sa !== sb ? sa - sb : b.score - a.score;
}

/**
 * Agrupa las recomendaciones pendientes en lo que la propietaria necesita ver
 * de un vistazo. `maxPorGrupo` acota lo que se PINTA, no lo que se cuenta: los
 * totales en € y el número de cosas salen de la lista entera.
 */
export function resumirAcciones(
  recomendaciones: RecomendacionResumible[],
  maxPorGrupo = 3,
): ResumenAccion {
  const perdidas = recomendaciones.filter(r => r.riesgo === 'PERDIDA').sort(ordenar);
  const ganancias = recomendaciones.filter(r => r.riesgo === 'OPORTUNIDAD').sort(ordenar);

  const suma = (rs: RecomendacionResumible[], unidad: string) =>
    Math.round(rs.reduce((t, r) => t + (r.impacto?.unidad === unidad ? r.impacto.valor : 0), 0));

  return {
    atencion: perdidas.slice(0, maxPorGrupo).map(aItem),
    oportunidades: ganancias.slice(0, maxPorGrupo).map(aItem),
    eurMesEnRiesgo: suma(perdidas, 'EUR_MES'),
    eurPuntualEnRiesgo: suma(perdidas, 'EUR'),
    eurMesOportunidad: suma(ganancias, 'EUR_MES'),
    eurPuntualOportunidad: suma(ganancias, 'EUR'),
    nUnToque: perdidas.filter(r => r.accion.tipo !== 'MARCAR_GESTIONADO').length,
    vacio: recomendaciones.length === 0,
  };
}

/** "3 cosas necesitan atención" · "Una cosa necesita atención". */
export function tituloAtencion(n: number): string {
  if (n === 1) return 'Una cosa necesita tu atención';
  return `${n} cosas necesitan tu atención`;
}

/** "2 oportunidades" · "Una oportunidad". */
export function tituloOportunidades(n: number): string {
  return n === 1 ? 'Una oportunidad' : `${n} oportunidades`;
}

/**
 * "1.240 €/mes" · "236 €" · "1.240 €/mes y 236 €" · null si no hay cifra que
 * enseñar. Nunca suma unidades distintas en un solo número.
 */
export function fraseEuros(eurMes: number, eurPuntual: number): string | null {
  const partes: string[] = [];
  if (eurMes > 0) partes.push(`${eurMes.toLocaleString('es-ES')} €/mes`);
  if (eurPuntual > 0) partes.push(`${eurPuntual.toLocaleString('es-ES')} €`);
  if (partes.length === 0) return null;
  return partes.join(' y ');
}

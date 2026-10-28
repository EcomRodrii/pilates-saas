// El tipo de centro que elige la persona. NO es decorativo: cambia (1) cómo se
// llama la clase de ejemplo y el estudio ficticio en la demo, (2) el vocabulario
// que Tenti usa al preguntar y (3) qué escenario se ofrece primero.
import type { IdEscenario } from './catalogo.ts';

export const TIPOS_CENTRO = ['pilates', 'yoga', 'barre', 'varias', 'otro'] as const;
export type TipoCentro = (typeof TIPOS_CENTRO)[number];

export interface ContextoDemo {
  /** Nombre de la clase de ejemplo («Pilates Mat»). */
  clase: string;
  /** Estudio ficticio. */
  estudio: string;
  /** Cómo llama a lo que hace el centro, para el prompt de Tenti. */
  disciplina: string;
}

export const CENTROS: Record<TipoCentro, { etiqueta: string; detalle: string; contexto: ContextoDemo; primero: IdEscenario }> = {
  pilates: {
    etiqueta: 'Pilates', detalle: 'Mat, Reformer, máquinas',
    contexto: { clase: 'Pilates Mat', estudio: 'Estudio Aurora', disciplina: 'Pilates' }, primero: 'ausencia_recuperacion',
  },
  yoga: {
    etiqueta: 'Yoga', detalle: 'Hatha, Vinyasa, meditación',
    contexto: { clase: 'Hatha yoga', estudio: 'Estudio Prana', disciplina: 'yoga' }, primero: 'caducidad_bono',
  },
  barre: {
    etiqueta: 'Barre', detalle: 'Barra, tonificación',
    contexto: { clase: 'Barre', estudio: 'Estudio Plié', disciplina: 'barre' }, primero: 'ausencia_recuperacion',
  },
  varias: {
    etiqueta: 'Varias disciplinas', detalle: 'Bonos que valen para unas clases y no para otras',
    contexto: { clase: 'Pilates Reformer', estudio: 'Estudio Cuerpo y Mente', disciplina: 'varias disciplinas' }, primero: 'orden_consumo_bonos',
  },
  otro: {
    etiqueta: 'Otro centro', detalle: 'Danza, fitness, bienestar…',
    contexto: { clase: 'Clase', estudio: 'Estudio Demo', disciplina: 'bienestar' }, primero: 'caducidad_bono',
  },
};

export function esTipoCentro(x: unknown): x is TipoCentro {
  return typeof x === 'string' && (TIPOS_CENTRO as readonly string[]).includes(x);
}

export const CONTEXTO_POR_DEFECTO: ContextoDemo = CENTROS.otro.contexto;

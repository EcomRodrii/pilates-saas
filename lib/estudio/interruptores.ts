// Funcionalidades que entran APAGADAS y el fundador enciende estudio a estudio,
// cada una con su variable de entorno (formato de `ASISTENTE_IA`):
//
//   on                    → encendida para todos
//   estudios:<id1>,<id2>  → solo en esos
//   cualquier otra cosa   → apagada (lo de serie)
//
// Un catálogo CERRADO: la próxima funcionalidad añade una línea aquí, no una
// ruta nueva. Se lee SOLO en el servidor (GET /api/estudio/interruptores): ni
// las variables ni los ids de estudio viajan al navegador. ⚠️ Cambiar una
// variable en Vercel no llega a producción sin un despliegue de código.
// Puro, sin `@/`.

import { estudiosDelInterruptor } from '../asistente/interruptor.ts';

export const INTERRUPTORES = {
  /** Filtros y columnas nuevos de Clientas (P2.8). */
  filtrosClientas: 'CLIENTAS_FILTROS',
} as const;

export type Interruptor = keyof typeof INTERRUPTORES;

export function encendidoPara(valor: string | undefined, studioId: string): boolean {
  if ((valor ?? '').trim() === 'on') return true;
  const estudios = estudiosDelInterruptor(valor);
  return !!estudios && !!studioId && estudios.includes(studioId);
}

export function interruptoresDe(studioId: string, entorno: Record<string, string | undefined>): Record<Interruptor, boolean> {
  return Object.fromEntries(
    (Object.keys(INTERRUPTORES) as Interruptor[]).map(k => [k, encendidoPara(entorno[INTERRUPTORES[k]], studioId)]),
  ) as Record<Interruptor, boolean>;
}

/**
 * Lo que contesta el endpoint. El navegador dice de qué estudio pregunta (el que
 * tiene abierto) y lo guarda bajo ese id; si la sesión ya es de OTRA sede (se
 * cambió en otra pestaña justo antes), todo apagado: si no, el «sí» de una sede
 * se recordaría 30 minutos bajo la otra.
 */
export function interruptoresPara(
  studioDeLaSesion: string,
  studioPedido: string | null,
  entorno: Record<string, string | undefined>,
): Record<Interruptor, boolean> {
  const todo = interruptoresDe(studioDeLaSesion, entorno);
  if (studioPedido === null || studioPedido === studioDeLaSesion) return todo;
  return Object.fromEntries(Object.keys(todo).map(k => [k, false])) as Record<Interruptor, boolean>;
}

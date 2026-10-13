// ─────────────────────────────────────────────────────────────────────────────
// Qué da por cumplido cada paso «hacer» de la visita.
//
// Se calcula de DATOS REALES, con el mismo criterio que la guía rápida
// (lib/onboarding.ts → datosOnboardingDelEstudio): nada se marca a mano ni se
// cree lo que el cliente dice. Si ya lo tenías hecho al llegar al paso (porque
// el asistente de alta lo creó, o porque lo hiciste otro día), el paso se da por
// bueno al entrar: nadie repite lo que ya hizo.
//
// ⚠️ Una tarifa «hecha» es una ACTIVA con precio. El asistente de alta deja
// borradores (inactivos, a 0 €) a propósito: contarlos marcaba «tienes tarifas»
// a quien todavía no podía cobrar ni asignar ninguna.
//
// Puro y sin React: tipos estructurales, se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { ClaveHecho } from './capitulos.ts';

export interface FuenteHecho {
  studio: { nif: string | null; razonSocial?: string | null; logoUrl: string | null };
  salas: readonly unknown[];
  tiposClase: readonly unknown[];
  sesiones: readonly unknown[];
  socios: readonly unknown[];
  instructores: readonly unknown[];
  planesTarifa: readonly { activo: boolean; precio: number }[];
  suscripciones: readonly unknown[];
}

export type DatosHecho = Record<ClaveHecho, boolean>;

export function datosHecho(f: FuenteHecho): DatosHecho {
  return {
    salas: f.salas.length > 0,
    tiposClase: f.tiposClase.length > 0,
    sesiones: f.sesiones.length > 0,
    socios: f.socios.length > 0,
    tarifaActiva: f.planesTarifa.some(p => p.activo && p.precio > 0),
    // Un bono y una cuota son una `suscripcion`: asignar cualquiera de los dos
    // crea una fila, y es lo que le da a la clienta algo que reservar.
    planAsignado: f.suscripciones.length > 0,
    datosFiscales: !!f.studio.nif?.trim() && !!f.studio.razonSocial?.trim(),
    instructores: f.instructores.length > 0,
    logo: !!f.studio.logoUrl,
  };
}

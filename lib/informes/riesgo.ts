// ─────────────────────────────────────────────────────────────────────────────
// «Clientas en riesgo» de Informes (panel nuevo, como el de «Estadísticas» de
// Bonsai). Sin regla nueva: dos listas que ya existen en Clientas, cada una con
// el MISMO cálculo que su chip y su filtro (lib/clientas/estado.ts):
//   · Sin renovar — el estado `SIN_RENOVAR` del chip (`/clientas?estado=SIN_RENOVAR`).
//   · Activas que llevan más de 30 días sin venir — estado `ACTIVA` y `sinVenir`,
//     los dos filtros de Clientas a la vez (`/clientas?estado=ACTIVA&mas=sin_venir_30d`).
//     Solo las activas: a quien ya se dio de baja o se fue hace meses no se la
//     está perdiendo, y esa lista larga taparía a las que sí.
// Es una foto de HOY, no del periodo que se mira.
//
// Puro, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { sinVenir, type HechosAsistencia, type ResultadoEstado } from '../clientas/estado.ts';

export interface ClientaEnRiesgo {
  socioId: string;
  /** Sin renovar: desde cuándo se quedó sin plan. Sin venir: su última clase. 'YYYY-MM-DD' o ISO, o null. */
  desde: string | null;
}

export interface ClientasEnRiesgo {
  sinRenovar: ClientaEnRiesgo[];
  activasSinVenir: ClientaEnRiesgo[];
}

/** El filtro de Clientas que enseña cada lista entera. */
export const ENLACE_SIN_RENOVAR = '/clientas?estado=SIN_RENOVAR';
export const ENLACE_ACTIVAS_SIN_VENIR = '/clientas?estado=ACTIVA&mas=sin_venir_30d';

export function clientasEnRiesgo(
  socios: readonly { id: string; fechaAlta?: string | null }[],
  porSocio: ReadonlyMap<string, ResultadoEstado>,
  hechos: ReadonlyMap<string, HechosAsistencia>,
  ahora: Date,
): ClientasEnRiesgo {
  const sinRenovar: ClientaEnRiesgo[] = [];
  const activasSinVenir: ClientaEnRiesgo[] = [];
  for (const s of socios) {
    const estado = porSocio.get(s.id);
    if (estado?.estado === 'SIN_RENOVAR') sinRenovar.push({ socioId: s.id, desde: estado.desde });
    else if (estado?.estado === 'ACTIVA' && sinVenir(estado, hechos.get(s.id), s.fechaAlta, ahora)) {
      activasSinVenir.push({ socioId: s.id, desde: hechos.get(s.id)?.ultimaAsistencia ?? null });
    }
  }
  // Sin renovar: la que se quedó sin plan más reciente primero (la más fácil de
  // recuperar). Sin venir: la que lleva más tiempo sin venir primero; sin ninguna
  // clase, al principio.
  const fecha = (c: ClientaEnRiesgo) => c.desde ?? '';
  sinRenovar.sort((a, b) => fecha(b).localeCompare(fecha(a)) || a.socioId.localeCompare(b.socioId));
  activasSinVenir.sort((a, b) => fecha(a).localeCompare(fecha(b)) || a.socioId.localeCompare(b.socioId));
  return { sinRenovar, activasSinVenir };
}

// ─────────────────────────────────────────────────────────────────────────────
// Las cifras de arriba de Equipo en el panel nuevo (14-oct-2026): quién da las
// clases de la semana, quién se queda fuera estos días y qué falta para que el
// coste del mes sea completo.
//
// Salen de lo que la pantalla ya tiene: las tarjetas de `GET /api/equipo/tarjetas`
// (ya recortadas al rol de quien mira, `lib/equipo-tarjetas.ts`) y las ausencias
// de `/api/equipo/ausencias`. Aquí no se pide nada nuevo al servidor.
//
// Los días son los del estudio ('YYYY-MM-DD' de Madrid, `hoyEnEstudio`): una
// ausencia que acaba hoy sigue contando hasta las 23:59 de Madrid, no de UTC.
//
// Puro (sin `@/`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { masDias } from '../utils.ts';
import { fechaCorta } from '../clientas/textos.ts';

/** Lo que hace falta de una tarjeta de Equipo para las cifras. */
export interface MiembroParaCifras {
  id: string;
  nombre: string;
  activo: boolean;
  esYo: boolean;
  /** Clases programadas esta semana, de lunes a domingo. */
  semana: number[];
  horasMes: number | null;
  costeMes: number | null;
}

const clasesDe = (m: Pick<MiembroParaCifras, 'semana'>) => m.semana.reduce((a, b) => a + b, 0);

/**
 * Quién da las clases de esta semana, de más a menos (a igualdad, por nombre).
 * Solo quien tiene alguna: una barra a cero no dice nada.
 */
export function repartoSemana<M extends MiembroParaCifras>(miembros: readonly M[]): { miembro: M; clases: number }[] {
  return miembros
    .map(miembro => ({ miembro, clases: clasesDe(miembro) }))
    .filter(f => f.clases > 0)
    .sort((a, b) => b.clases - a.clases || a.miembro.nombre.localeCompare(b.miembro.nombre, 'es'));
}

/**
 * Quien más clases da esta semana, o `null` si nadie tiene ninguna. `empatadas`
 * dice cuántas más dan las mismas: «Marta y 2 más» no es lo mismo que «Marta».
 */
export function quienMasClases(miembros: readonly MiembroParaCifras[]): { nombre: string; clases: number; empatadas: number } | null {
  const reparto = repartoSemana(miembros);
  if (reparto.length === 0) return null;
  const { miembro, clases } = reparto[0];
  return { nombre: miembro.nombre, clases, empatadas: reparto.filter(f => f.clases === clases).length - 1 };
}

/**
 * Cuántas personas tienen horas de clase este mes y ninguna tarifa puesta: su
 * coste no está sumado en «Coste del mes». Solo tiene sentido para quien ve el
 * coste (la propietaria): a los demás el servidor les manda `costeMes` vacío a
 * todas. Tu propia ficha no cuenta en el coste del equipo.
 */
export function sinTarifaConHoras(miembros: readonly MiembroParaCifras[]): number {
  return miembros.filter(m => !m.esYo && m.activo && (m.horasMes ?? 0) > 0 && m.costeMes == null).length;
}

export interface AusenciaParaCifras {
  instructorId: string;
  /** 'YYYY-MM-DD', los dos incluidos. */
  desde: string;
  hasta: string;
}

/**
 * Las ausencias que tocan los próximos `dias` días: las que ya han empezado y
 * siguen, y las que empiezan antes de que acabe el plazo. Por fecha de inicio.
 */
export function ausenciasProximas<A extends AusenciaParaCifras>(ausencias: readonly A[], hoy: string, dias = 30): A[] {
  const limite = masDias(hoy, dias);
  return ausencias
    .filter(a => a.hasta >= hoy && a.desde <= limite)
    .sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta));
}

/**
 * «Hoy», «Hasta hoy» o «Hasta el 24 oct» si ya ha empezado; «El 20 oct» si es un
 * día; y si no, «Del 20 al 24 oct».
 */
export function textoRangoAusencia(desde: string, hasta: string, hoy: string): string {
  if (desde <= hoy) {
    if (hasta === hoy) return desde === hoy ? 'Hoy' : 'Hasta hoy';
    return `Hasta el ${fechaCorta(hasta, hoy)}`;
  }
  if (desde === hasta) return `El ${fechaCorta(desde, hoy)}`;
  // Mismo mes y año: «Del 20 al 24 oct»; si no, las dos fechas enteras.
  const corta = desde.slice(0, 7) === hasta.slice(0, 7) ? String(Number(desde.slice(8, 10))) : fechaCorta(desde, hoy);
  return `Del ${corta} al ${fechaCorta(hasta, hoy)}`;
}

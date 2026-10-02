// ─────────────────────────────────────────────────────────────────────────────
// El bloque «Clases» de Informes (rediseño del 2-oct-2026, decisión F3).
//
// Qué clases entran: las no canceladas que EMPEZARON dentro del tramo, contado en
// días del ESTUDIO (de las 00:00 del primer día a las 24:00 del último, hora de
// Madrid) y que ya han empezado. Una clase de esta tarde todavía no tiene a nadie
// que haya venido o faltado: contarla bajaría la ocupación de hoy a mediodía.
//
// Ocupación = plazas reservadas en esas clases, vinieran o no (ASISTIDA +
// NO_ASISTIO + CONFIRMADA), sobre el aforo. Una falta ocupó la plaza: nadie más
// pudo cogerla. «Vinieron» = ASISTIDA y nada más.
//
// Si en el tramo el estudio no pasó lista (ninguna ASISTIDA, pero sí reservas en
// clases ya empezadas), no se sabe quién vino: `sinPasarLista`, para decirlo en
// vez de enseñar una lista vacía que parece «no vino nadie».
//
// Puro: se prueba con `node --test` (también con `TZ=UTC`).
// ─────────────────────────────────────────────────────────────────────────────

import type { Tramo } from '../cobros/lo-cobrado.ts';
import { finDelDiaEstudio, franjaLocalDe, inicioDelDiaEstudio } from '../utils.ts';

export interface SesionParaInforme {
  id: string;
  tipoClaseId: string;
  instructorId: string;
  inicio: string;
  aforoMaximo: number;
  cancelada: boolean;
}

export interface ReservaParaInforme {
  sesionId: string;
  socioId: string | null;
  estado: string;
}

const OCUPA_PLAZA = new Set(['ASISTIDA', 'NO_ASISTIO', 'CONFIRMADA']);

export interface Ocupacion {
  nClases: number;
  aforo: number;
  /** Plazas reservadas (vinieran o no). */
  ocupadas: number;
  /** Redondeado; `null` si no hay aforo que medir. */
  pct: number | null;
}

export interface SesionDelInforme {
  sesionId: string;
  inicio: string;
  tipoClaseId: string;
  instructorId: string;
  aforo: number;
  ocupadas: number;
  vinieron: number;
}

export interface FranjaDelInforme extends Ocupacion {
  /** '<dow>-HH:MM', en hora del estudio (0 = domingo). */
  clave: string;
  /** «Martes 18:00». */
  texto: string;
  sesiones: SesionDelInforme[];
}

export interface TipoDelInforme extends Ocupacion {
  tipoClaseId: string;
  franjas: FranjaDelInforme[];
}

export interface ClasesDelTramo extends Ocupacion {
  /** Reservas ASISTIDA en esas clases. */
  vinieron: number;
  /** Ninguna ASISTIDA y sí reservas en clases ya empezadas: no se pasó lista. */
  sinPasarLista: boolean;
  tipos: TipoDelInforme[];
  sesiones: SesionDelInforme[];
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const dosCifras = (n: number) => String(n).padStart(2, '0');

const pctDe = (ocupadas: number, aforo: number): number | null => (aforo > 0 ? Math.round((ocupadas / aforo) * 100) : null);

function sumar(sesiones: readonly SesionDelInforme[]): Ocupacion {
  let aforo = 0, ocupadas = 0;
  for (const s of sesiones) { aforo += s.aforo; ocupadas += s.ocupadas; }
  return { nClases: sesiones.length, aforo, ocupadas, pct: pctDe(ocupadas, aforo) };
}

/** Las clases del tramo que ya han empezado (`ahora`), en orden. */
export function sesionesDelTramo<S extends SesionParaInforme>(sesiones: readonly S[], t: Tramo, ahora: Date): S[] {
  const desde = new Date(inicioDelDiaEstudio(t.desde)).getTime();
  const hasta = new Date(finDelDiaEstudio(t.hasta)).getTime();
  const limite = ahora.getTime();
  return sesiones
    .filter(s => {
      if (s.cancelada) return false;
      const ms = new Date(s.inicio).getTime();
      return ms >= desde && ms < hasta && ms <= limite;
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export function clasesDelTramo(
  sesiones: readonly SesionParaInforme[], reservas: readonly ReservaParaInforme[], t: Tramo, ahora: Date,
): ClasesDelTramo {
  const dentro = sesionesDelTramo(sesiones, t, ahora);
  const porSesion = new Map(dentro.map(s => [s.id, { ocupadas: 0, vinieron: 0 }]));
  for (const r of reservas) {
    const c = porSesion.get(r.sesionId);
    if (!c || !OCUPA_PLAZA.has(r.estado)) continue;
    c.ocupadas++;
    if (r.estado === 'ASISTIDA') c.vinieron++;
  }

  const detalle: SesionDelInforme[] = dentro.map(s => ({
    sesionId: s.id, inicio: s.inicio, tipoClaseId: s.tipoClaseId, instructorId: s.instructorId,
    aforo: Math.max(0, s.aforoMaximo ?? 0), ...porSesion.get(s.id)!,
  }));

  // Por tipo y, dentro, por franja recurrente (día de la semana + hora del estudio).
  const porTipo = new Map<string, Map<string, { orden: number; texto: string; sesiones: SesionDelInforme[] }>>();
  for (const s of detalle) {
    const { dow, hora, minuto } = franjaLocalDe(s.inicio);
    const clave = `${dow}-${dosCifras(hora)}:${dosCifras(minuto)}`;
    const franjas = porTipo.get(s.tipoClaseId) ?? new Map();
    porTipo.set(s.tipoClaseId, franjas);
    const f = franjas.get(clave) ?? { orden: ((dow + 6) % 7) * 1440 + hora * 60 + minuto, texto: `${DIAS[dow]} ${dosCifras(hora)}:${dosCifras(minuto)}`, sesiones: [] };
    franjas.set(clave, f);
    f.sesiones.push(s);
  }

  const tipos: TipoDelInforme[] = [...porTipo.entries()].map(([tipoClaseId, franjas]) => {
    const lista = [...franjas.entries()]
      .sort((a, b) => a[1].orden - b[1].orden)
      .map(([clave, f]) => ({ clave, texto: f.texto, sesiones: f.sesiones, ...sumar(f.sesiones) }));
    return { tipoClaseId, franjas: lista, ...sumar(lista.flatMap(f => f.sesiones)) };
  }).sort((a, b) => b.ocupadas - a.ocupadas || b.nClases - a.nClases || a.tipoClaseId.localeCompare(b.tipoClaseId));

  const total = sumar(detalle);
  const vinieron = detalle.reduce((n, s) => n + s.vinieron, 0);
  return { ...total, vinieron, sinPasarLista: vinieron === 0 && total.ocupadas > 0, tipos, sesiones: detalle };
}

/** Diferencia de ocupación en puntos (`null` si a alguno de los dos le falta aforo). */
export const puntosDeDiferencia = (actual: Ocupacion, anterior: Ocupacion | null): number | null =>
  anterior && actual.pct != null && anterior.pct != null ? actual.pct - anterior.pct : null;

// Lógica pura de BUSCAR (overlay de búsqueda del portal de la clienta) —
// separada del componente para poder testearse sin React/DOM, mismo criterio
// que lib/portal-bienvenida.ts / lib/portal-modo.tsx.
//
// El diseño original (Claude Design, "Tentare App Cliente v2" ·
// Tentare Studio App.dc.html) mostraba, sin query:
//   · "Búsquedas recientes" — chips con ejemplos de la maqueta.
//   · "Popular en tu estudio" — una fila tipo "estudio" y una tipo
//     "instructora", con una nota de "popularidad" cruzada entre estudios.
//
// El portal es de UN SOLO estudio (arquitectura mono-estudio confirmada): no
// existe "popularidad entre estudios", así que esa sección se sustituye por
// datos 100% reales de ESTE estudio — nunca un ranking fabricado (mismo
// principio que ya aplica lib/portal-tema/valoracion.ts: por debajo del
// mínimo, no se pinta nada, nunca un número sin dato detrás):
//
//   · Fila 1 — el tipo de clase con más reservas CONFIRMADA/ASISTIDA en las
//     últimas `VENTANA_POPULARES_DIAS` (sesiones ya ocurridas, no futuras:
//     "popular" es lo que la gente ha estado reservando, no lo que hay en
//     agenda). Ausente si nadie ha reservado nada en la ventana.
//   · Fila 2 — la instructora activa con mejor valoración, con el mismo
//     mínimo de reseñas que ya exige `valoracionParaPantalla` en toda la
//     pantalla (nunca una nota con menos de `MINIMO_VALORACIONES` detrás).
//     Ausente si ninguna instructora llega al mínimo.
//
// Si ninguna de las dos existe, la sección entera se omite — no se rellena
// con un placeholder.

import type { Instructor, Reserva, Sesion, TipoClase } from './types.ts';
import { valoracionParaPantalla } from './portal-tema/valoracion.ts';

export type TipoResultadoBusqueda = 'tipo_clase' | 'instructor';

export interface ResultadoBusqueda {
  tipo: TipoResultadoBusqueda;
  id: string;
  nombre: string;
  /** Segunda línea, SIEMPRE derivada de un dato real — nunca inventada. */
  meta: string;
  fotoUrl: string | null;
  /** Color del tipo de clase / de la instructora, para el icono sin foto. */
  color: string | null;
  href: string;
}

/** Mismos estados que "ocupa plaza" en el resto del portal (portal-clases-view.tsx). */
const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];

/** Ventana de "reciente" para el ranking de popularidad — un mes natural aprox. */
export const VENTANA_POPULARES_DIAS = 28;

function normaliza(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function iniciales(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
}

/**
 * El tipo de clase que más ha impartido esta instructora, de las que ha dado
 * DE VERDAD (sesiones no canceladas) — no de todo el catálogo del estudio.
 * Mismo criterio que ya usa `app/portal/[slug]/instructores/[instructorId]/page.tsx`
 * para "Especialidades", aquí reducido a la principal para caber en una línea.
 */
export function especialidadPrincipalDe(
  instructorId: string,
  sesiones: Sesion[],
  tiposClase: TipoClase[],
): TipoClase | null {
  const conteo = new Map<string, number>();
  for (const s of sesiones) {
    if (s.instructorId !== instructorId || s.cancelada) continue;
    conteo.set(s.tipoClaseId, (conteo.get(s.tipoClaseId) ?? 0) + 1);
  }
  if (conteo.size === 0) return null;
  const [idPrincipal] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
  return tiposClase.find(tc => tc.id === idPrincipal) ?? null;
}

function resultadoDeTipoClase(tc: TipoClase, slug: string, meta: string): ResultadoBusqueda {
  return {
    tipo: 'tipo_clase',
    id: tc.id,
    nombre: tc.nombre,
    meta,
    fotoUrl: tc.fotoUrl,
    color: tc.color,
    href: `/portal/${slug}/clases?tipo=${encodeURIComponent(tc.id)}`,
  };
}

function resultadoDeInstructor(i: Instructor, slug: string, meta: string): ResultadoBusqueda {
  return {
    tipo: 'instructor',
    id: i.id,
    nombre: i.nombre,
    meta,
    fotoUrl: i.fotoUrl ?? i.avatar ?? null,
    color: i.color,
    href: `/portal/${slug}/instructores/${i.id}`,
  };
}

/**
 * "Popular en tu estudio" — como mucho 2 filas, las dos derivadas de datos
 * reales de ESTE estudio (ver cabecera del fichero). Nunca rellena un hueco
 * que no tiene detrás: si ninguna de las dos aplica, devuelve `[]`.
 */
export function resultadosPopulares({
  tiposClase, instructores, sesiones, reservas, ahora, slug,
}: {
  tiposClase: TipoClase[];
  instructores: Instructor[];
  sesiones: Sesion[];
  reservas: Reserva[];
  ahora: Date;
  slug: string;
}): ResultadoBusqueda[] {
  const resultado: ResultadoBusqueda[] = [];

  // Fila 1: tipo de clase más reservado en la ventana reciente (histórico,
  // sesiones ya ocurridas — "popular" mira atrás, no la agenda futura).
  const desde = ahora.getTime() - VENTANA_POPULARES_DIAS * 86_400_000;
  const sesionesRecientes = new Map<string, Sesion>();
  for (const s of sesiones) {
    if (s.cancelada) continue;
    const t = new Date(s.inicio).getTime();
    if (t >= desde && t <= ahora.getTime()) sesionesRecientes.set(s.id, s);
  }
  if (sesionesRecientes.size > 0) {
    const conteoPorTipo = new Map<string, number>();
    for (const r of reservas) {
      if (!OCUPA_PLAZA.includes(r.estado)) continue;
      const s = sesionesRecientes.get(r.sesionId);
      if (!s) continue;
      conteoPorTipo.set(s.tipoClaseId, (conteoPorTipo.get(s.tipoClaseId) ?? 0) + 1);
    }
    const top = [...conteoPorTipo.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [tipoClaseId, n] = top;
      const tc = tiposClase.find(t => t.id === tipoClaseId);
      if (tc) {
        resultado.push(resultadoDeTipoClase(tc, slug, `Tipo de clase · ${n} ${n === 1 ? 'reserva' : 'reservas'} este mes`));
      }
    }
  }

  // Fila 2: instructora activa con mejor nota, solo si llega al mínimo de
  // reseñas para poder enseñarse (mismo umbral que el resto del portal).
  let mejor: { i: Instructor; media: number; total: number } | null = null;
  for (const i of instructores) {
    if (!i.activo) continue;
    const v = valoracionParaPantalla(i.valoracion ?? null);
    if (!v || !i.valoracion) continue;
    if (!mejor || i.valoracion.media > mejor.media) mejor = { i, media: i.valoracion.media, total: i.valoracion.total };
  }
  if (mejor) {
    const val = valoracionParaPantalla(mejor.i.valoracion ?? null);
    const especialidad = especialidadPrincipalDe(mejor.i.id, sesiones, tiposClase);
    const partes = ['Instructora', especialidad?.nombre, val ? `★ ${val.nota}` : null].filter(Boolean);
    resultado.push(resultadoDeInstructor(mejor.i, slug, partes.join(' · ')));
  }

  return resultado;
}

/**
 * Resultados de una query real, cruzada contra el catálogo del estudio
 * (tipos de clase + instructoras activas) — nunca contra datos de fuera.
 * Coincidencia por subcadena, sin acentos, sobre el nombre.
 */
export function resultadosBusqueda({
  query, tiposClase, instructores, sesiones, slug,
}: {
  query: string;
  tiposClase: TipoClase[];
  instructores: Instructor[];
  sesiones: Sesion[];
  slug: string;
}): ResultadoBusqueda[] {
  const q = normaliza(query);
  if (!q) return [];

  const deTipos = tiposClase
    .filter(tc => normaliza(tc.nombre).includes(q))
    .map(tc => resultadoDeTipoClase(tc, slug, `Tipo de clase · ${tc.duracionMinutos} min`));

  const deInstructores = instructores
    .filter(i => i.activo && normaliza(i.nombre).includes(q))
    .map(i => {
      const val = valoracionParaPantalla(i.valoracion ?? null);
      const especialidad = especialidadPrincipalDe(i.id, sesiones, tiposClase);
      const partes = ['Instructora', especialidad?.nombre, val ? `★ ${val.nota}` : null].filter(Boolean);
      return resultadoDeInstructor(i, slug, partes.join(' · '));
    });

  return [...deTipos, ...deInstructores];
}

/** Iniciales para el icono de un resultado sin `fotoUrl`. */
export { iniciales as inicialesDeResultado };

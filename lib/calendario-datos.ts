// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — forma del payload que sirve /api/calendario.
//
// Puro y sin IO a propósito: la ruta (app/api/calendario/route.ts) hace las
// queries y le pasa los datos ya traídos; aquí solo se decide QUÉ va en la
// respuesta según el rol. Así el contrato por rol se puede testear sin tocar
// Supabase ni Next — "los tres roles reciben payloads distintos, con test".
// ─────────────────────────────────────────────────────────────────────────────

import type { Sesion, Rol } from './types.ts';
import { puedeMoverDinero } from './permisos-reglas.ts';

// Duplicado deliberadamente en vez de importado de lib/sustituciones/contacto.ts:
// ese archivo arrastra imports @/lib/* (server-only, Twilio, billing…) que
// rompen bajo `node --test` (solo resuelve relativos, no alias de Next). Mismos
// 4 valores que `ESTADOS_EN_JUEGO` allí — atados al CHECK de la tabla
// `sustituciones` (migr 0037/0042/0043), no algo que cambie a la ligera.
const ESTADOS_SUSTITUCION_EN_JUEGO = ['buscando', 'pendiente_aprobacion', 'contactando', 'agotada'];

// Sesión + lo que el rediseño necesita saber que no vive en `sesiones` (la
// sustitución sigue apuntando a `instructor_original_id`, nunca pone a null
// `sesiones.instructor_id` — ver lib/calendario-estado.ts).
export interface SesionCalendario extends Sesion {
  sustitucionAbierta: boolean;
  /** Motivo de la baja, para el texto del aviso "Sin instructora" — null si no hay sustitución abierta. */
  motivoBaja: string | null;
  /** id de la fila en `sustituciones` en juego — necesario para poder
   *  resolverla de verdad (PATCH /api/sustituciones {action:'confirmar'}).
   *  null si no hay ninguna abierta. */
  sustitucionId: string | null;
}

interface SustitucionMinima {
  id: string;
  sesion_id: string;
  estado: string;
  motivo: string | null;
}

// Cruza sesiones con sus sustituciones activas (una sesión puede tener varias
// filas históricas en `sustituciones` — canceladas, resueltas — así que se
// queda con la más reciente en juego, si hay alguna).
export function enriquecerSesiones(
  sesiones: Sesion[],
  sustituciones: SustitucionMinima[],
): SesionCalendario[] {
  const abiertaPorSesion = new Map<string, SustitucionMinima>();
  for (const s of sustituciones) {
    if (!ESTADOS_SUSTITUCION_EN_JUEGO.includes(s.estado)) continue;
    // Si hubiera más de una (no debería, pero los datos reales sorprenden),
    // la última del array gana — el caller ya las trae ordenadas por creado_en.
    abiertaPorSesion.set(s.sesion_id, s);
  }
  return sesiones.map(s => {
    const abierta = abiertaPorSesion.get(s.id);
    return {
      ...s,
      sustitucionAbierta: !!abierta,
      motivoBaja: abierta?.motivo ?? null,
      sustitucionId: abierta?.id ?? null,
    };
  });
}

// El importe de una clase suelta (precioPuntual) es dinero: fuera del payload
// si el rol no puede moverlo. No se pone a `undefined` (desaparecería del
// JSON de forma indistinguible de "no se cargó"): se pone a `null`
// explícito, igual que el resto de campos ausentes de este tipo en el repo.
export function ocultarImporteSiCorresponde(sesiones: SesionCalendario[], rol: Rol): SesionCalendario[] {
  if (puedeMoverDinero(rol)) return sesiones;
  return sesiones.map(s => ({ ...s, precioPuntual: null }));
}

// INSTRUCTOR ve solo sus propias clases (punto 6) — la RLS ya lo garantiza a
// nivel de fila, esto es la forma del payload confirmándolo también en TS,
// por si esta ruta alguna vez se sirve con un cliente que no sea admin.
export function filtrarSesionesPorRol(
  sesiones: SesionCalendario[],
  rol: Rol,
  instructorId: string | null,
): SesionCalendario[] {
  if (rol !== 'INSTRUCTOR') return sesiones;
  if (!instructorId) return [];
  return sesiones.filter(s => s.instructorId === instructorId);
}

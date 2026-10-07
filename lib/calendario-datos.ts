// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — forma del payload que sirve /api/calendario.
//
// Puro y sin IO a propósito: la ruta (app/api/calendario/route.ts) hace las
// queries y le pasa los datos ya traídos; aquí solo se decide QUÉ va en la
// respuesta según el rol. Así el contrato por rol se puede testear sin tocar
// Supabase ni Next — "los tres roles reciben payloads distintos, con test".
// ─────────────────────────────────────────────────────────────────────────────

import type { Sesion, Rol, Instructor } from './types.ts';
import { puedeMoverDinero, puedeVer, puedeVerContactoEquipo, puedeVerDetalleAusencias } from './permisos-reglas.ts';
import { ausenciaDeSesion, type AusenciaDeClase, type BloqueoAgenda } from './calendario/ausencias.ts';

// Duplicado deliberadamente en vez de importado de lib/sustituciones/contacto.ts:
// ese archivo arrastra imports @/lib/* (server-only, WhatsApp, billing…) que
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
  /** En qué punto está esa sustitución: no es lo mismo «buscando» que «espera
   *  tu visto bueno» (`pendiente_aprobacion`). null sin ninguna abierta. */
  sustitucionEstado: string | null;
  /** Su instructora no puede (vacaciones, baja, bloqueo de agenda). null = no
   *  hay ninguna, o no se ha podido saber: lo dice `ausenciasCargadas` del payload. */
  ausencia: AusenciaDeClase | null;
  /** Su instructora está dada de baja en el equipo (RES-8). */
  instructoraInactiva: boolean;
  /** La regla A4 del Decision OS la da por floja, con las cifras que lo
   *  sostienen. Solo para quien ve el Centro de Control; sin recomendación, null. */
  floja: FlojaDeClase | null;
  /** Plazas apartadas para ClassPass y hasta cuándo (migr 20261007164222):
   *  desde Tentare no se pueden coger. Sin ninguna, null o ausente. */
  apartadas?: ApartadasDeClase | null;
}

/** Las plazas de una clase apartadas para una plataforma que vende a mano (hoy, ClassPass). */
export interface ApartadasDeClase {
  plazas: number;
  /** ISO: cuándo se liberan las que no haya vendido. */
  hasta: string;
}

/** Lo que dice A4 de una clase que va floja (`recomendaciones.datos_usados`). */
export interface FlojaDeClase {
  recomendacionId: string;
  reservasAhora: number;
  aforo: number;
  /** Lo que suele llevar esa franja a estas alturas. */
  referenciaHabitual: number;
  diasVista: number;
  /** Cuántas semanas se han comparado. */
  ocurrencias: number;
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
      sustitucionEstado: abierta?.estado ?? null,
      ausencia: null,
      instructoraInactiva: false,
      floja: null,
    };
  });
}

// Lo que el calendario necesita saber de cada clase y que no vive en `sesiones`:
// si su instructora no puede, si ya no está en el equipo y si A4 la da por floja.
// La ruta trae los datos; aquí se decide qué ve cada rol:
// - el TIPO de ausencia (baja médica) puede hablar de salud: solo para quien
//   gestiona el equipo (`puedeVerDetalleAusencias`); el resto ve «no está disponible»;
// - «floja» sale del Decision OS, que es de quien ve el Centro de Control.
export function completarSesiones(
  sesiones: SesionCalendario[],
  datos: {
    rol: Rol;
    bloqueos: readonly BloqueoAgenda[];
    ausencias: ReadonlyMap<string, { tipo: string; desde: string; hasta: string }>;
    instructorasInactivas: ReadonlySet<string>;
    flojas: ReadonlyMap<string, FlojaDeClase>;
    apartadas?: ReadonlyMap<string, ApartadasDeClase>;
  },
): SesionCalendario[] {
  const verTipo = puedeVerDetalleAusencias(datos.rol);
  const verFlojas = puedeVer(datos.rol, '/centro-de-control');
  return sesiones.map(s => {
    const ausencia = ausenciaDeSesion(s, datos.bloqueos, datos.ausencias);
    return {
      ...s,
      ausencia: ausencia && !verTipo ? { ...ausencia, tipo: 'OTRO' } : ausencia,
      instructoraInactiva: !!s.instructorId && datos.instructorasInactivas.has(s.instructorId),
      floja: verFlojas ? datos.flojas.get(s.id) ?? null : null,
      apartadas: datos.apartadas?.get(s.id) ?? null,
    };
  });
}

/** Una recomendación LLENAR_PLAZAS (A4) leída como «floja»; null si no trae sus cifras. */
export function flojaDeRecomendacion(r: { id: string; datos_usados: unknown }): FlojaDeClase | null {
  const d = (r.datos_usados ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const reservasAhora = num(d.reservasAhora), aforo = num(d.aforo), referenciaHabitual = num(d.referenciaHabitual);
  const diasVista = num(d.diasVista), ocurrencias = num(d.ocurrenciasComparadas);
  // Sin respaldo no se pinta: un «floja» sin sus cifras sería una etiqueta sin base.
  if (reservasAhora === null || aforo === null || referenciaHabitual === null || diasVista === null || ocurrencias === null) return null;
  return { recomendacionId: r.id, reservasAhora, aforo, referenciaHabitual, diasVista, ocurrencias };
}

// El importe de una clase suelta (precioPuntual) es dinero: fuera del payload
// si el rol no puede moverlo. No se pone a `undefined` (desaparecería del
// JSON de forma indistinguible de "no se cargó"): se pone a `null`
// explícito, igual que el resto de campos ausentes de este tipo en el repo.
export function ocultarImporteSiCorresponde(sesiones: SesionCalendario[], rol: Rol): SesionCalendario[] {
  if (puedeMoverDinero(rol)) return sesiones;
  return sesiones.map(s => ({ ...s, precioPuntual: null }));
}

// El equipo va entero en el payload (nombre y color pintan la rejilla), pero el
// contacto de las compañeras solo a quien organiza el calendario. La ficha
// propia se queda intacta: el calendario se reconoce a sí mismo por
// `authUserId`, y sin él la instructora dejaría de ver sus botones.
export function instructoresVisiblesPorRol(
  instructores: Instructor[],
  rol: Rol,
  propioAuthUserId: string | null,
): Instructor[] {
  if (puedeVerContactoEquipo(rol)) return instructores;
  return instructores.map(i => (propioAuthUserId && i.authUserId === propioAuthUserId)
    ? i
    : { ...i, email: null, telefono: null, authUserId: null });
}

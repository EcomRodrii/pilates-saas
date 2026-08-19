import type { Reserva, Sesion, Suscripcion, PlanTarifa, TipoClase, Sala, Instructor } from './types.ts';
import type { RachaInfo } from './engines/streak-engine.ts';
import { planCubreTipoClase } from './bono-logic.ts';

// ¿Esta socia puede reservar sin pagar por clase suelta ahora mismo? — true si
// tiene una suscripción activa que cubre la sesión: mensual ilimitado, o bono
// con sesiones restantes. Si no, se le debe mostrar el precio de clase suelta.
export function tieneCoberturaPlan(
  activeSus: Suscripcion | null,
  plan: PlanTarifa | null,
  // Un plan acotado a ciertos tipos de clase no cubre las demás: sin esto, el
  // portal le decía "incluida en tu bono" a una clase que el gate iba a
  // rechazar. Sin tipo se responde por el plan, como antes.
  tipoClaseId?: string | null,
): boolean {
  if (!activeSus || !plan) return false;
  if (!planCubreTipoClase(plan, tipoClaseId)) return false;
  if (plan.tipo === 'MENSUAL') return true;
  if (plan.tipo === 'BONO') return (activeSus.sesionesRestantes ?? 0) > 0;
  return false;
}

// Decide qué tarjeta principal mostrar en el Home del portal de miembros.
// Función pura y reutilizable — sin JSX, sin estado — para que la lógica de
// negocio ("¿qué le importa a esta socia ahora mismo?") no viva enredada en
// el componente de página.

export type HomeCardContext =
  | { caso: 'PROXIMA_CLASE'; sesion: Sesion; tipo: TipoClase | null; sala: Sala | null; instructor: Instructor | null; reserva: Reserva }
  | { caso: 'ULTIMA_SESION'; sesionesRestantes: number }
  | { caso: 'RACHA_EN_RIESGO'; semanas: number; diasParaPerder: number }
  | { caso: 'INACTIVA'; diasSinVenir: number }
  | { caso: 'SIN_CLASES' };

const DIAS_INACTIVIDAD = 10;

export function getHomeCardContext({
  now,
  misReservas,
  sesiones,
  tiposClase,
  salas,
  instructores,
  activeSus,
  racha,
}: {
  now: Date;
  misReservas: Reserva[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  activeSus: Suscripcion | null;
  racha: RachaInfo;
}): HomeCardContext {
  const sesionById = new Map(sesiones.map(s => [s.id, s])); // P0-22
  const proxima = misReservas
    .filter(r => r.estado === 'CONFIRMADA')
    .map(r => ({ r, s: sesionById.get(r.sesionId) }))
    .filter((x): x is { r: Reserva; s: Sesion } => !!x.s && new Date(x.s.inicio) > now)
    .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime())[0] ?? null;

  // CASO C — se le acaba el bono: es lo más urgente, se avisa aunque ya
  // tenga una clase reservada.
  if (activeSus?.sesionesRestantes === 1) {
    return { caso: 'ULTIMA_SESION', sesionesRestantes: 1 };
  }

  // CASO E — tiene una racha de semanas y todavía no ha entrenado esta
  // semana. Solo se avisa si no tiene ya una clase reservada que la salve.
  if (!proxima && racha.enRiesgo && racha.diasParaPerder != null) {
    return { caso: 'RACHA_EN_RIESGO', semanas: racha.semanas, diasParaPerder: racha.diasParaPerder };
  }

  // CASO B — ya tiene una clase confirmada próxima.
  if (proxima) {
    const tipo = tiposClase.find(t => t.id === proxima.s.tipoClaseId) ?? null;
    const sala = salas.find(s => s.id === proxima.s.salaId) ?? null;
    const instructor = instructores.find(i => i.id === proxima.s.instructorId) ?? null;
    return { caso: 'PROXIMA_CLASE', sesion: proxima.s, tipo, sala, instructor, reserva: proxima.r };
  }

  // CASO D — lleva más de 10 días sin asistir (y no tiene nada reservado).
  const ultimaAsistida = misReservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionById.get(r.sesionId))
    .filter((s): s is Sesion => !!s)
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime())[0] ?? null;

  if (ultimaAsistida) {
    const dias = Math.floor((now.getTime() - new Date(ultimaAsistida.inicio).getTime()) / 86400000);
    if (dias >= DIAS_INACTIVIDAD) {
      return { caso: 'INACTIVA', diasSinVenir: dias };
    }
  }

  // CASO A — nunca ha reservado nada, o no tiene nada pendiente ni activo reciente.
  return { caso: 'SIN_CLASES' };
}

// ── Bloques de sistema "tiraSemana"/"progresoSemanal" (temas Oliva/Noir) ────
// Funciones puras — igual que getHomeCardContext() arriba — para que la
// lógica de negocio no viva enredada en el JSX de portal-home-view.tsx.

export interface DiaTiraSemana {
  fecha: Date;
  /** Lunes=0 … domingo=6, para pintar la letra del día sin tirar de Intl en cada render. */
  indiceSemana: number;
  esHoy: boolean;
  tieneClaseReservada: boolean;
}

/**
 * Los 7 días de la semana ACTUAL (lunes a domingo), con si la socia tiene una
 * reserva `CONFIRMADA` ese día. `now` decide qué semana es "esta semana" y
 * cuál es "hoy" — pasado explícito (no `new Date()` aquí dentro) por el mismo
 * motivo que ya documenta portal-home-view.tsx: servidor y navegador no
 * pueden coincidir en "ahora".
 */
export function calcularTiraSemana(now: Date, misReservas: Reserva[], sesiones: Sesion[]): DiaTiraSemana[] {
  const sesionById = new Map(sesiones.map(s => [s.id, s]));
  // Lunes de esta semana: getDay() es 0=domingo, así que domingo necesita un
  // salto de 6 días atrás, el resto de -1.
  const diaSemanaHoy = now.getDay();
  const offsetLunes = diaSemanaHoy === 0 ? 6 : diaSemanaHoy - 1;
  const lunes = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetLunes);

  const fechasConReserva = new Set(
    misReservas
      .filter(r => r.estado === 'CONFIRMADA')
      .map(r => sesionById.get(r.sesionId))
      .filter((s): s is Sesion => !!s)
      .map(s => new Date(s.inicio).toDateString()),
  );

  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
    return {
      fecha,
      indiceSemana: i,
      esHoy: fecha.toDateString() === now.toDateString(),
      tieneClaseReservada: fechasConReserva.has(fecha.toDateString()),
    };
  });
}

// Límite de REFERENCIA del anillo, no una "meta" configurable — no existe ese
// concepto en el esquema del tema hoy y no se inventa uno solo para pintar un
// anillo (ver harmonic-discovering-kettle.md). 5 clases/semana es un ritmo
// alto y realista para Pilates — el anillo rara vez se ve completo, que es lo
// que lo hace legible como "progreso", no como una cuota que hay que cumplir.
export const META_PROGRESO_SEMANAL = 5;

/**
 * Nº de reservas `CONFIRMADA` de la socia en la semana de `now`
 * (lunes-domingo) — cuenta reservas, no días (dos clases el mismo día suman
 * 2, a diferencia de `calcularTiraSemana`, que solo necesita saber SI hubo
 * clase ese día para el punto).
 */
export function calcularProgresoSemanal(now: Date, misReservas: Reserva[], sesiones: Sesion[]): number {
  const sesionById = new Map(sesiones.map(s => [s.id, s]));
  const diaSemanaHoy = now.getDay();
  const offsetLunes = diaSemanaHoy === 0 ? 6 : diaSemanaHoy - 1;
  const lunes = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetLunes);
  const domingoFin = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 7);

  return misReservas.filter(r => {
    if (r.estado !== 'CONFIRMADA') return false;
    const s = sesionById.get(r.sesionId);
    if (!s) return false;
    const inicio = new Date(s.inicio);
    return inicio >= lunes && inicio < domingoFin;
  }).length;
}

// ── Accesos rápidos ─────────────────────────────────────────────────────────
// Extraído del JSX (portal-home-view.tsx) al pasar de UNA forma a tres: los
// datos son los mismos en las tres, solo cambia cómo se pintan, así que
// calcularlos en un sitio y probarlos aparte evita que las variantes se
// desincronicen entre sí. Mismo criterio que getHomeCardContext/tiraSemana.

/** Un acceso rápido del Inicio. `icono` solo lo usan rejilla/círculos. */
export interface AccesoRapido {
  etiqueta: string;
  valor: string;
  href: string;
  /** Nombre de icono de lucide — el mismo catálogo que usa portal-nav.tsx. */
  icono: string;
  /** Punto de aviso (hay notificaciones sin leer). */
  punto?: boolean;
}

/**
 * Los CUATRO destinos reales del portal. Ojo: el prototipo de diseño usa otros
 * cuatro (Reservar/Mis reservas/Favoritas/Mi bono) porque es una maqueta —
 * cambiar CUÁLES son es una decisión de producto, no del tema, así que aquí se
 * mantienen los de la app y solo cambia la FORMA.
 */
export function accesosRapidosDe({ slug, portalHref, proximas, totalAsistidas, sinLeer, nInstructoras }: {
  slug: string;
  /**
   * Construye el enlace completo (base `/portal` o `/portal-preview`, y el
   * token si aplica) — ver `usePortalHref` en `portal-preview-bridge.ts`. Se
   * pasa desde fuera porque este módulo es puro (sin hooks de React) y no
   * puede saber por sí solo si está montado dentro del editor de temas.
   */
  portalHref: (ruta: string) => string;
  proximas: number;
  totalAsistidas: number;
  /**
   * `null` = todavía no se sabe (los avisos vienen del servidor y la respuesta
   * no ha llegado, o falló). NO es lo mismo que 0: colapsarlo a 0 hacía que la
   * fila afirmara «Al día» —en palabras, más rotundo que el numeral de la
   * campana— sobre algo que aún no se ha comprobado.
   */
  sinLeer: number | null;
  nInstructoras: number;
}): AccesoRapido[] {
  const plural = (n: number, sing: string, pl = `${sing}s`) => `${n} ${n === 1 ? sing : pl}`;
  const hayNuevos = sinLeer !== null && sinLeer > 0;
  return [
    { etiqueta: 'Mis reservas', icono: 'CalendarDays', href: portalHref(`/${slug}/reservas`),
      valor: proximas > 0 ? plural(proximas, 'próxima') : 'Ninguna' },
    { etiqueta: 'Mi progreso', icono: 'Sparkles', href: portalHref(`/${slug}/progreso`),
      valor: plural(totalAsistidas, 'clase') },
    { etiqueta: 'Notificaciones', icono: 'Bell', href: portalHref(`/${slug}/notificaciones`),
      valor: hayNuevos ? plural(sinLeer, 'nueva') : sinLeer === null ? '—' : 'Al día', punto: hayNuevos },
    { etiqueta: 'El equipo', icono: 'User', href: portalHref(`/${slug}/instructores`),
      valor: plural(nInstructoras, 'instructora') },
  ];
}

/**
 * El rótulo de la sección. La variante de filas no lleva ninguno (hoy no hay
 * encabezado ahí); rejilla/círculos sí, y Oliva lo dice en primera persona,
 * como el prototipo ("Mis accesos rápidos" vs "Accesos rápidos").
 */
export function rotuloAccesos(variante: 'filas' | 'rejilla' | 'circulos'): string | null {
  if (variante === 'filas') return null;
  return variante === 'rejilla' ? 'Mis accesos rápidos' : 'Accesos rápidos';
}

/**
 * "Buenos días / Buenas tardes / Buenas noches" según la hora LOCAL de quien
 * mira (variante `cabeceraInicio: 'titular'`). Puro y con los cortes
 * explícitos para poder probarlos: un saludo que se equivoca de franja es el
 * tipo de detalle que solo se ve en producción a las 21:00.
 */
export function saludoPorHora(now: Date): string {
  const h = now.getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

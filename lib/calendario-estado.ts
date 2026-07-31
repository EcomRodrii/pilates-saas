// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — el estado de una clase se DERIVA, nunca se guarda.
//
// Antes el grid pintaba cada sesión con condicionales dispersos por todo
// page.tsx, y una clase terminada seguía pareciendo activa hasta que alguien
// recargaba. Aquí vive la única fuente de verdad, pura y sin IO: dados los
// datos de la sesión, la hora actual y tres señales ya calculadas en otro
// sitio (conflicto de sala/instructora, sustitución abierta, check-ins que
// faltan), decide un único estado.
//
// Orden de gravedad — lo que exige una decisión gana sobre lo que no:
// CANCELADA → SIN_INSTRUCTORA → INCIDENCIA → CONFLICTO → SIN_PASAR_LISTA →
// EN_CURSO → FINALIZADA → PROGRAMADA. SIN_PASAR_LISTA solo puede aparecer una
// vez terminada la clase (comparte ventana temporal con FINALIZADA: es la
// versión "con algo pendiente" de lo mismo, no un estado independiente).
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoSesion =
  | 'PROGRAMADA' | 'EN_CURSO' | 'FINALIZADA' | 'SIN_PASAR_LISTA'
  | 'SIN_INSTRUCTORA' | 'INCIDENCIA' | 'CONFLICTO' | 'CANCELADA';

export interface PintaEstado {
  label: string;
  /** Fondo del bloque/badge — expresión de color CSS (var(--token) o color-mix). */
  fondo: string;
  /** Color del texto/icono sobre `fondo`. */
  tinta: string;
  /** Color de la barra lateral del bloque en la rejilla. */
  barra: string;
}

// Los cinco tonos semánticos del panel, derivados de los tokens reales de
// app/globals.css (--brand-medio/--warning/--destructive/--muted) — nunca un
// hex nuevo inventado aquí. `color-mix` da el fondo pálido sin necesitar una
// variable de "warning más clarito" que no existe.
const TONO = {
  neutral: { fondo: 'var(--card)', tinta: 'var(--foreground)', barra: 'var(--border)' },
  apagado: { fondo: 'var(--muted)', tinta: 'var(--muted-foreground)', barra: 'var(--border)' },
  exito: {
    fondo: 'color-mix(in srgb, var(--brand-medio) 14%, var(--card))',
    tinta: 'var(--brand-medio)', barra: 'var(--brand-medio)',
  },
  aviso: {
    fondo: 'color-mix(in srgb, var(--warning) 16%, var(--card))',
    tinta: 'var(--warning)', barra: 'var(--warning)',
  },
  peligro: {
    fondo: 'color-mix(in srgb, var(--destructive) 12%, var(--card))',
    tinta: 'var(--destructive)', barra: 'var(--destructive)',
  },
} as const;

// Fuente de verdad ÚNICA del color de estado. Ningún componente decide
// colores por su cuenta — todos importan esto.
export const PINTA: Record<EstadoSesion, PintaEstado> = {
  EN_CURSO: { label: 'En curso', ...TONO.exito },
  PROGRAMADA: { label: 'Programada', ...TONO.neutral },
  FINALIZADA: { label: 'Finalizada', ...TONO.apagado },
  SIN_PASAR_LISTA: { label: 'Falta pasar lista', ...TONO.aviso },
  SIN_INSTRUCTORA: { label: 'Sin instructora', ...TONO.aviso },
  INCIDENCIA: { label: 'Incidencia', ...TONO.peligro },
  CONFLICTO: { label: 'Conflicto de sala', ...TONO.peligro },
  CANCELADA: { label: 'Cancelada', ...TONO.apagado },
};

export interface SesionParaEstado {
  cancelada: boolean;
  inicio: string;
  fin: string;
  /** Texto libre de incidencia (sesiones.incidencia_texto). null/undefined = sin incidencia. */
  incidenciaTexto?: string | null;
}

export interface ContextoEstadoSesion {
  /** Hay una fila en `sustituciones` para esta sesión con estado en juego
   *  (buscando/pendiente_aprobacion/contactando/agotada): el instructor
   *  original avisó de que no puede venir y todavía no hay sustituta
   *  confirmada. `sesiones.instructor_id` NO se pone a null en este caso —
   *  por eso esta señal no puede leerse de la propia sesión. */
  sustitucionAbierta: boolean;
  /** Choque de sala o de instructora con otra sesión (detectarConflictos, lib/calendar-logic.ts). */
  conflicto: boolean;
  /** Reservas CONFIRMADA sin check-in. Solo importa una vez terminada la clase. */
  confirmadasSinCheckin: number;
}

export function estadoSesion(
  s: SesionParaEstado,
  ahora: Date,
  ctx: ContextoEstadoSesion,
): EstadoSesion {
  if (s.cancelada) return 'CANCELADA';
  if (ctx.sustitucionAbierta) return 'SIN_INSTRUCTORA';
  if (s.incidenciaTexto) return 'INCIDENCIA';
  if (ctx.conflicto) return 'CONFLICTO';

  const ahoraMs = ahora.getTime();
  const finMs = new Date(s.fin).getTime();
  if (ahoraMs >= finMs) return ctx.confirmadasSinCheckin > 0 ? 'SIN_PASAR_LISTA' : 'FINALIZADA';

  const inicioMs = new Date(s.inicio).getTime();
  if (ahoraMs >= inicioMs) return 'EN_CURSO';
  return 'PROGRAMADA';
}

// ¿Esta clase exige que alguien decida algo? (punto 3: franja de decisiones,
// y el punto de atención en la cabecera de cada sala/día). No es solo el
// estado: una clase PROGRAMADA con más aforo del que cabe en la sala también
// pide una decisión, aunque su EstadoSesion sea neutro. Una CANCELADA nunca
// pide nada — ya está resuelta.
//
// `huecosLibres` (aforoMaximo - confirmadas, nunca negativo) es a propósito
// una señal DISTINTA de `enEspera`: `promocionar_siguiente_espera` (la RPC que
// resuelve "Ofrecer plaza") no comprueba aforo por su cuenta — asume que quien
// la llama ya sabe que hay un hueco de verdad. Una clase LLENA con lista de
// espera es un estado SANO (el sistema ya avisa solo en cuanto alguien
// cancela) — no debe pedir decisión ni ofrecer overselling.
export function pideDecision(
  estado: EstadoSesion,
  o: { enEspera: number; sobreaforo: number; huecosLibres: number },
): boolean {
  if (estado === 'CANCELADA') return false;
  if (['SIN_INSTRUCTORA', 'INCIDENCIA', 'CONFLICTO', 'SIN_PASAR_LISTA'].includes(estado)) return true;
  return (o.enEspera > 0 && o.huecosLibres > 0) || o.sobreaforo > 0;
}

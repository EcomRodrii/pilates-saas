// ─────────────────────────────────────────────────────────────────────────────
// Paso 3 del alta nueva, «Tu estudio» (maqueta aprobada del 21-oct-2026,
// 03-maqueta-texto.txt §03): dónde está y cuándo abre, en dos pantallas. De lo
// que escribe a lo que se guarda, sin red, para probarlo con `node --test`.
//
// Lo que se guarda, y por qué ahí (decisión C3 del plan: ninguna columna nueva):
//   · su nombre → `auth.users.user_metadata.nombre` (el que ya leen el saludo
//     del Resumen y Mi perfil);
//   · dirección, código postal y ciudad → `studios` (la página de reservas pinta
//     «ciudad · dirección», app/reservar/[slug]/page.tsx);
//   · «¿Tienes varias sedes?» → `studios.onb_centros`, que ya existía y solo se
//     leía en /interno. Ahora además decide lo que dice el alta;
//   · la franja → `studios.hora_apertura/hora_cierre` (el eje del calendario) y
//     los días → `studio_horario`, el horario por día de Configuración.
// La provincia NO se guarda: sale del código postal cuando hace falta
// (lib/geo/provincias.ts). La zona horaria tampoco: todo se calcula en hora de
// Madrid (`TZ_ESTUDIO`, lib/utils.ts) y ofrecer cambiarla sería prometer algo
// que no funciona (decisión del fundador del 21-oct).
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiaHorario } from '../types.ts';
import { OPCIONES_HORARIO } from '../onboarding/plan-configuracion.ts';
import { PLAN_INFO } from '../billing/entitlements.ts';
import { esCanarias, provinciaDeCp } from '../geo/provincias.ts';

export { esCanarias };

// ── «¿Tienes varias sedes?» ──────────────────────────────────────────────────

/** 5 = «5 o más». */
export const TOTALES_SEDES = [2, 3, 4, 5] as const;
export type TotalSedes = (typeof TOTALES_SEDES)[number];
export type Sedes = { tipo: 'una' } | { tipo: 'varias'; total: TotalSedes };

/** El plan de varias sedes: su precio sale SIEMPRE del catálogo, nunca escrito a mano. */
export const PRECIO_CADENA_MES = PLAN_INFO.CADENA.precioMes;

/**
 * Lo que se escribe en `studios.onb_centros`. Texto legible (como las opciones
 * del asistente de siempre, `OPCIONES_CENTROS`), porque /interno lo cuenta tal
 * cual: «1 estudio», «3 estudios», «5 o más estudios».
 */
export function onbCentrosDe(s: Sedes): string {
  if (s.tipo === 'una') return '1 estudio';
  return s.total >= 5 ? '5 o más estudios' : `${s.total} estudios`;
}

/**
 * Al revés, para volver a la pantalla con lo que ya contestó. Entiende también
 * las respuestas del asistente de siempre («2-3 estudios», «Más de 10»): una
 * cuenta que lo contestó allí no tiene que volver a hacerlo. Sin respuesta,
 * `null` (la pantalla enseña «Solo esta», lo más habitual).
 */
export function sedesDeOnbCentros(valor: string | null | undefined): Sedes | null {
  const v = (valor ?? '').trim();
  if (!v) return null;
  if (/^más de/i.test(v)) return { tipo: 'varias', total: 5 };
  const n = Number(/^(\d+)/.exec(v)?.[1]);
  if (!Number.isFinite(n) || n <= 1) return { tipo: 'una' };
  return { tipo: 'varias', total: (Math.min(n, 5) as TotalSedes) };
}

/** «2», «3»… o «4 o más»: cuántas quedan por abrir además de la de hoy. */
export function otrasSedes(total: TotalSedes): string {
  return total >= 5 ? '4 o más' : String(total - 1);
}

/** Las sedes que se dibujan después de la segunda: «Sede 3», «Sedes 3 y 4», «Sede 3 y las demás». */
export function restoDeSedes(total: TotalSedes): string | null {
  if (total <= 2) return null;
  if (total === 3) return 'Sede 3';
  if (total === 4) return 'Sedes 3 y 4';
  return 'Sede 3 y las demás';
}

export function tituloDonde(s: Sedes): string {
  return s.tipo === 'varias' ? 'Dónde está tu primera sede' : 'Dónde está tu estudio';
}

export function etiquetaDonde(s: Sedes): string {
  return s.tipo === 'varias'
    ? `Paso 3 de 5 · Tu primera sede (1 de ${s.total >= 5 ? '5 o más' : s.total}) · unos 3 minutos`
    : 'Paso 3 de 5 · Tu estudio, 1 de 2 · unos 3 minutos';
}

export function etiquetaCuando(s: Sedes): string {
  return s.tipo === 'varias' ? 'Paso 3 de 5 · Tu primera sede, 2 de 2 · 1 minuto' : 'Paso 3 de 5 · Tu estudio, 2 de 2 · 1 minuto';
}

// ── «Dónde está» ─────────────────────────────────────────────────────────────

export interface DatosDonde {
  nombre: string;
  direccion: string;
  codigoPostal: string;
  ciudad: string;
}

export type ErroresDonde = Partial<Record<keyof DatosDonde, string>>;

/** Lo que falta o no vale, campo a campo, con el mensaje que se enseña debajo. Vacío = se puede guardar. */
export function erroresDonde(d: DatosDonde): ErroresDonde {
  const e: ErroresDonde = {};
  if (!d.nombre.trim()) e.nombre = 'Escribe tu nombre: así te saludamos.';
  if (!d.direccion.trim()) e.direccion = 'Escribe la calle y el número: es lo que verán tus alumnas.';
  if (!provinciaDeCp(d.codigoPostal)) e.codigoPostal = 'Escribe los cinco números de tu código postal.';
  if (!d.ciudad.trim()) e.ciudad = 'Escribe la ciudad.';
  return e;
}

/** Lo que se manda: sin espacios de más y con el código postal sin huecos. */
export function limpiarDonde(d: DatosDonde): DatosDonde {
  const una = (t: string, max: number) => t.replace(/\s+/g, ' ').trim().slice(0, max);
  return {
    nombre: una(d.nombre, 80),
    direccion: una(d.direccion, 200),
    codigoPostal: d.codigoPostal.replace(/\s/g, '').slice(0, 5),
    ciudad: una(d.ciudad, 100),
  };
}

/** La línea de debajo del código postal: la provincia, sin servicio externo. */
export function textoProvincia(codigoPostal: string): string {
  const p = provinciaDeCp(codigoPostal);
  return p ? `Provincia: ${p.nombre}. Sale sola de tu código postal.` : 'La provincia sale sola de tu código postal.';
}

/** Como la pinta la página de reservas: «ciudad · dirección» (app/reservar/[slug]/page.tsx). */
export function lineaDireccion(ciudad: string, direccion: string): string {
  return [ciudad.trim(), direccion.trim()].filter(Boolean).join(' · ');
}

// ── «Cuándo abre» ────────────────────────────────────────────────────────────

export type HorarioId = 'mananas' | 'tardes' | 'manana-y-tarde' | 'nueve-a-nueve' | 'otro';

const NOMBRES_HORARIO = ['Solo mañanas', 'Solo tardes', 'Mañana y tarde', 'De 9 a 21'] as const;
const IDS_HORARIO = ['mananas', 'tardes', 'manana-y-tarde', 'nueve-a-nueve'] as const;

/** «HH:MM:SS» o «HH:MM» → «HH:MM». */
export function aHoraCorta(h: string | null | undefined): string {
  const m = /^(\d{2}):(\d{2})/.exec(h ?? '');
  return m ? `${m[1]}:${m[2]}` : '';
}

/** «HH:MM» → «HH:MM:SS», como lo guardan `studios` y `studio_horario`. */
export function aHoraBd(h: string): string {
  return `${aHoraCorta(h)}:00`;
}

/**
 * Las franjas de un toque. Las horas son las de `OPCIONES_HORARIO`
 * (lib/onboarding/plan-configuracion.ts), las mismas de la bienvenida de
 * siempre: aquí solo cambia cómo se nombran en pantalla.
 */
export const HORARIOS_ALTA: readonly { id: Exclude<HorarioId, 'otro'>; nombre: string; apertura: string; cierre: string }[] =
  OPCIONES_HORARIO.map((o, i) => ({
    id: IDS_HORARIO[i], nombre: NOMBRES_HORARIO[i], apertura: aHoraCorta(o.apertura), cierre: aHoraCorta(o.cierre),
  }));

/** La de serie si no ha elegido nada: mañana y tarde, la que más abarca. */
export const HORARIO_POR_DEFECTO: Exclude<HorarioId, 'otro'> = 'manana-y-tarde';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** «Otro horario»: dos horas que existen y la de cierre después de la de apertura. */
export function horarioOtroValido(apertura: string, cierre: string): boolean {
  return HORA.test(apertura) && HORA.test(cierre) && apertura < cierre;
}

/** La franja elegida, o `null` si «Otro horario» todavía no vale. */
export function franjaDe(id: HorarioId, otro: { apertura: string; cierre: string }): { apertura: string; cierre: string } | null {
  if (id === 'otro') return horarioOtroValido(otro.apertura, otro.cierre) ? { apertura: otro.apertura, cierre: otro.cierre } : null;
  const h = HORARIOS_ALTA.find(x => x.id === id);
  return h ? { apertura: h.apertura, cierre: h.cierre } : null;
}

/** Para volver a la pantalla con lo que ya tiene: una de las cuatro, u «Otro horario» con sus horas. */
export function horarioIdDe(apertura: string | null | undefined, cierre: string | null | undefined): HorarioId {
  const a = aHoraCorta(apertura);
  const c = aHoraCorta(cierre);
  return HORARIOS_ALTA.find(h => h.apertura === a && h.cierre === c)?.id ?? 'otro';
}

/** Lunes primero, como se lee una semana; `diaSemana` es el de `studio_horario` (0 = domingo … 6 = sábado). */
export const DIAS_ALTA = [
  { letra: 'L', nombre: 'Lunes', corto: 'LUN', diaSemana: 1 },
  { letra: 'M', nombre: 'Martes', corto: 'MAR', diaSemana: 2 },
  { letra: 'X', nombre: 'Miércoles', corto: 'MIÉ', diaSemana: 3 },
  { letra: 'J', nombre: 'Jueves', corto: 'JUE', diaSemana: 4 },
  { letra: 'V', nombre: 'Viernes', corto: 'VIE', diaSemana: 5 },
  { letra: 'S', nombre: 'Sábado', corto: 'SÁB', diaSemana: 6 },
  { letra: 'D', nombre: 'Domingo', corto: 'DOM', diaSemana: 0 },
] as const;

/** Sin nada guardado: de lunes a sábado. */
export const DIAS_POR_DEFECTO: readonly boolean[] = [true, true, true, true, true, true, false];

/**
 * Los días que abre (lunes primero) según su horario por día. Un estudio recién
 * creado no tiene filas en `studio_horario` (no hay trigger: las crea el primer
 * guardado), y entonces se proponen los de serie.
 */
export function diasDe(horarioSemana: readonly DiaHorario[] | null | undefined): boolean[] {
  if (!horarioSemana || horarioSemana.length !== 7) return [...DIAS_POR_DEFECTO];
  return DIAS_ALTA.map(d => horarioSemana.find(f => f.diaSemana === d.diaSemana)?.abierto ?? false);
}

/** ¿Ha guardado ya su horario por día alguna vez? (Si no, las horas de `studios` son las de serie, no una elección.) */
export function horarioGuardado(horarioSemana: readonly DiaHorario[] | null | undefined): boolean {
  return !!horarioSemana && horarioSemana.length === 7;
}

/**
 * Las siete filas de `studio_horario` (0 = domingo … 6 = sábado), la misma
 * franja los días que abre y cerrado los demás. Es lo que guarda «Horario» de
 * Configuración, donde luego lo afina día a día.
 */
export function filasHorario(dias: readonly boolean[], apertura: string, cierre: string): DiaHorario[] {
  return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => {
    const abierto = !!dias[(diaSemana + 6) % 7];
    return {
      diaSemana,
      abierto,
      horaApertura: abierto ? aHoraBd(apertura) : null,
      horaCierre: abierto ? aHoraBd(cierre) : null,
    };
  });
}

export function erroresCuando(id: HorarioId, otro: { apertura: string; cierre: string }, dias: readonly boolean[]): { horario?: string; dias?: string } {
  const e: { horario?: string; dias?: string } = {};
  if (!franjaDe(id, otro)) e.horario = 'La hora de cierre tiene que ser después de la de apertura.';
  if (!dias.some(Boolean)) e.dias = 'Elige al menos un día.';
  return e;
}

// ── «Así se verá tu semana» ──────────────────────────────────────────────────
// La vista previa del paso es el calendario REAL del panel (`SemanaFranjas` en
// escritorio, `VistaAgenda` en el móvil), sin clases todavía: lo que hay que
// darle es lo mismo que le da el Calendario, sacado de lo que se está eligiendo.

export interface DiaDeLaSemanaPrevista {
  /** 'YYYY-MM-DD', día del estudio. */
  iso: string;
  /** 0 = domingo, como `Date.getDay()`. */
  diaSemana: number;
  cerrado: boolean;
}

/**
 * Los siete días que enseña el Calendario al abrirse: desde HOY (en Madrid), no
 * desde el lunes (`weekStart` del Calendario). `dias` va de lunes a domingo, como
 * `DIAS_ALTA`.
 */
export function semanaPrevista(hoyIso: string, dias: readonly boolean[]): DiaDeLaSemanaPrevista[] {
  const [y, m, d] = hoyIso.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    // A mediodía UTC: sumar días no cruza de fecha por el cambio de hora.
    const f = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + i, 12));
    const diaSemana = f.getUTCDay();
    const iso = f.toISOString().slice(0, 10);
    const indice = DIAS_ALTA.findIndex(x => x.diaSemana === diaSemana);
    return { iso, diaSemana, cerrado: !dias[indice] };
  });
}

/**
 * Las horas de la franja, enteras, para las filas de la semana: de la hora en
 * que abre a la primera hora entera en que ya ha cerrado (07:30–21:15 → 7 a 22).
 * `null` si la franja no vale.
 */
export function horasDeLaFranja(franja: { apertura: string; cierre: string } | null): { desdeHora: number; hastaHora: number } | null {
  if (!franja) return null;
  const a = minutosDe(franja.apertura);
  const c = minutosDe(franja.cierre);
  if (a == null || c == null || c <= a) return null;
  return { desdeHora: Math.floor(a / 60), hastaHora: Math.ceil(c / 60) };
}

function minutosDe(hhmm: string): number | null {
  const [h, m] = aHoraCorta(hhmm).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

// ── El embudo ────────────────────────────────────────────────────────────────

/**
 * ¿Está «Tu estudio» guardado de verdad? Lo mira el SERVIDOR antes de apuntar
 * `config_completada` en el embudo (app/api/alta/paso): se mide lo que hay en la
 * base de datos, no lo que dice la pantalla. Dirección completa y las siete
 * filas del horario por día (un estudio nuevo no las tiene hasta guardarlas).
 */
export function tuEstudioGuardado(f: {
  direccion: string | null | undefined;
  codigoPostal: string | null | undefined;
  ciudad: string | null | undefined;
  filasHorario: number;
}): boolean {
  return !!f.direccion?.trim() && !!provinciaDeCp(f.codigoPostal) && !!f.ciudad?.trim() && f.filasHorario >= 7;
}

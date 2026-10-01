// Qué hay que decirle a Urban Sports Club para que su app enseñe el horario de
// Tentare. Función pura: entra lo que hay en Tentare y lo que ya se envió,
// sale la lista de llamadas. Quien llama (lib/plataformas/usc/horario-servidor.ts)
// solo las ejecuta y guarda el resultado.
//
// Reglas que vienen de USC, no de Tentare:
//  · Un evento es UNA clase suelta (no hay recurrencias en su API).
//  · Solo se publica a dos semanas vista: su app no enseña más.
//  · Inicio, ubicación y plazo de cancelación tardía NO se pueden cambiar en un
//    evento creado: se cancela y se crea otro. Cancelar allí cancela también
//    las reservas de sus socias (nos llegan por webhook y se cancelan aquí).
//  · El plazo de cancelación tardía va de 0 a 12 h.
//
// Qué se publica: las clases cuyo tipo (o la propia sesión) tiene plazas
// cedidas a USC (`plataforma_cupos`). Sin fila, o con 0 plazas, no se publica:
// ceder plazas es la forma de decir «esta clase va a USC».
//
// Por qué el «bookingCount» no es la ocupación a secas: USC calcula lo que le
// queda como `seats - bookingCount - sus reservas`. Si se le ceden menos plazas
// que el aforo, `seats` es el cupo, y el recuento tiene que crecer solo cuando
// la gente de fuera de USC ya se come parte de ese cupo. Así USC nunca enseña
// más huecos de los que hay de verdad. Y si aun así vende uno que ya no existe
// (carrera entre dos pasadas), el Instant Booking lo rechaza con E001: el
// recuento es para que su app no prometa, no el candado.

import { TZ_ESTUDIO } from '../../utils.ts';

export const VENTANA_PUBLICACION_DIAS = 14;
/** Categoría «Pilates» del catálogo de USC (GET /eventcategories). */
export const CATEGORIA_PILATES_USC = 4;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_CANCELACION_TARDIA_HORAS = 12;

export interface ConfigUsc {
  providerId: string;
  locationId: string;
  /** Categoría deportiva de USC (Pilates = 4 en su catálogo). */
  categoriaId: number;
  zonaHoraria?: string;
}

export interface SesionParaUsc {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
  aforo: number;
  nombre: string;
  descripcion: string | null;
  instructorId: string | null;
  /** Ventana de cancelación del tipo (o del estudio), en horas. */
  cancelacionHoras: number | null;
  /** Plazas cedidas a USC ya resueltas (sesión → tipo). null = sin ceder. */
  cupo: number | null;
  /** CONFIRMADA/ASISTIDA que NO vienen de USC. */
  ocupadasFueraDeUsc: number;
}

export interface EventoUscGuardado {
  /** null = la sesión se borró en Tentare: el evento sigue vivo allí. */
  sesionId: string | null;
  eventoId: string;
  cancelado: boolean;
  huellaFija: string | null;
  huella: string | null;
  ocupadasEnviadas: number | null;
}

export interface CuerpoEventoUsc {
  name: string;
  categoryId: number;
  trainerIds: string[];
  locationId: string;
  providerId: string;
  seats: number;
  startDate: string;
  startTime: string;
  duration: string;
  lateCancellationDeadline: string;
  description: Record<string, string>;
}

export type OperacionUsc =
  | { tipo: 'crear'; sesionId: string; cuerpo: CuerpoEventoUsc; huellaFija: string; huella: string; claveIdempotencia: string; ocupadas: number }
  | { tipo: 'recrear'; sesionId: string; eventoAnterior: string; cuerpo: CuerpoEventoUsc; huellaFija: string; huella: string; claveIdempotencia: string; ocupadas: number }
  | { tipo: 'editar'; sesionId: string; eventoId: string; cambios: Partial<CuerpoEventoUsc>; huella: string }
  | { tipo: 'cancelar'; sesionId: string | null; eventoId: string }
  | { tipo: 'ocupacion'; sesionId: string; eventoId: string; bookingCount: number };

/** El providerId/locationId de USC de un estudio, o null si va en modo manual. */
export function configUscDe(config: unknown): ConfigUsc | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const providerId = typeof c.providerId === 'string' ? c.providerId.trim().toLowerCase() : '';
  const locationId = typeof c.locationId === 'string' ? c.locationId.trim().toLowerCase() : '';
  if (!RE_UUID.test(providerId) || !RE_UUID.test(locationId)) return null;
  const cat = Number(c.categoriaId);
  return { providerId, locationId, categoriaId: Number.isInteger(cat) && cat > 0 ? cat : CATEGORIA_PILATES_USC };
}

/**
 * ¿Publica este estudio en USC ahora mismo? Necesita los IDs Y no estar en
 * modo manual. Al volver a manual los IDs se CONSERVAN: hacen falta para
 * cancelar allí lo que ya se publicó.
 */
export function uscPublicaPorApi(config: unknown): boolean {
  return configUscDe(config) !== null && (config as Record<string, unknown> | null)?.modo !== 'manual';
}

const dos = (n: number) => String(n).padStart(2, '0');

/** Fecha y hora LOCALES del estudio, que es lo que USC espera. */
export function fechaHoraLocal(iso: string, tz: string = TZ_ESTUDIO): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const v = (t: string) => partes.find(p => p.type === t)?.value ?? '00';
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}` };
}

export function duracionUsc(inicio: string, fin: string): string {
  const min = Math.max(1, Math.round((Date.parse(fin) - Date.parse(inicio)) / 60000));
  return `${dos(Math.floor(min / 60))}:${dos(min % 60)}`;
}

export function cancelacionTardiaUsc(horas: number | null): string {
  const h = Math.min(MAX_CANCELACION_TARDIA_HORAS, Math.max(0, Math.round(horas ?? 0)));
  return `${dos(h)}:00:00`;
}

/** Plazas que se publican: lo cedido, nunca más que el aforo. 0 = no se publica. */
export function plazasPublicadas(cupo: number | null, aforo: number): number {
  if (cupo == null) return 0;
  return Math.max(0, Math.min(cupo, aforo));
}

/** Ver cabecera: lo que ocupa gente de fuera de USC DENTRO de lo publicado. */
export function bookingCountUsc(ocupadasFuera: number, publicadas: number, aforo: number): number {
  return Math.min(publicadas, Math.max(0, ocupadasFuera + publicadas - aforo));
}

export function cuerpoEventoUsc(s: SesionParaUsc, cfg: ConfigUsc, trainerId: string | null): CuerpoEventoUsc {
  const { fecha, hora } = fechaHoraLocal(s.inicio, cfg.zonaHoraria);
  const texto = (s.descripcion ?? '').trim() || s.nombre;
  return {
    name: s.nombre.slice(0, 120),
    categoryId: cfg.categoriaId,
    trainerIds: trainerId ? [trainerId] : [],
    locationId: cfg.locationId,
    providerId: cfg.providerId,
    seats: plazasPublicadas(s.cupo, s.aforo),
    startDate: fecha,
    startTime: hora,
    duration: duracionUsc(s.inicio, s.fin),
    lateCancellationDeadline: cancelacionTardiaUsc(s.cancelacionHoras),
    description: { es: texto.slice(0, 2000) },
  };
}

export function huellaFijaDe(c: CuerpoEventoUsc): string {
  return [c.startDate, c.startTime, c.locationId, c.lateCancellationDeadline].join('|');
}

export function huellaDe(c: CuerpoEventoUsc): string {
  return JSON.stringify([c.name, c.categoryId, c.trainerIds, c.seats, c.duration, c.description]);
}

const CAMPOS_EDITABLES = ['name', 'categoryId', 'trainerIds', 'seats', 'duration', 'description'] as const;

export function planificarHorarioUsc(p: {
  sesiones: SesionParaUsc[];
  eventos: EventoUscGuardado[];
  config: ConfigUsc;
  trainerPorInstructora: ReadonlyMap<string, string>;
  ahora: number;
  /** Fecha de alta de la integración en USC: antes no deja crear eventos. */
  noAntesDe?: number | null;
}): OperacionUsc[] {
  const limite = p.ahora + VENTANA_PUBLICACION_DIAS * 86_400_000;
  const eventoDe = new Map(p.eventos.filter(e => e.sesionId).map(e => [e.sesionId as string, e]));
  const ops: OperacionUsc[] = [];

  for (const s of [...p.sesiones].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const inicio = Date.parse(s.inicio);
    if (!(inicio > p.ahora)) continue; // empezada o pasada: ni se crea ni se toca
    const ev = eventoDe.get(s.id);
    const vivo = ev && !ev.cancelado ? ev : null;
    const publicadas = plazasPublicadas(s.cupo, s.aforo);
    const debePublicarse = !s.cancelada && publicadas > 0 && inicio <= limite
      && (p.noAntesDe == null || inicio >= p.noAntesDe);

    if (!debePublicarse) {
      if (vivo) ops.push({ tipo: 'cancelar', sesionId: s.id, eventoId: vivo.eventoId });
      continue;
    }

    const trainer = s.instructorId ? p.trainerPorInstructora.get(s.instructorId) ?? null : null;
    const cuerpo = cuerpoEventoUsc(s, p.config, trainer);
    const huellaFija = huellaFijaDe(cuerpo);
    const huella = huellaDe(cuerpo);
    const ocupadas = bookingCountUsc(s.ocupadasFueraDeUsc, publicadas, s.aforo);
    const clave = `${s.id}:${huellaFija}`;

    if (!vivo) {
      ops.push({ tipo: 'crear', sesionId: s.id, cuerpo, huellaFija, huella, claveIdempotencia: clave, ocupadas });
      continue;
    }
    if (vivo.huellaFija !== huellaFija) {
      ops.push({ tipo: 'recrear', sesionId: s.id, eventoAnterior: vivo.eventoId, cuerpo, huellaFija, huella, claveIdempotencia: clave, ocupadas });
      continue;
    }
    if (vivo.huella !== huella) {
      const cambios: Partial<CuerpoEventoUsc> = {};
      for (const k of CAMPOS_EDITABLES) (cambios as Record<string, unknown>)[k] = cuerpo[k];
      ops.push({ tipo: 'editar', sesionId: s.id, eventoId: vivo.eventoId, cambios, huella });
    }
    if (vivo.ocupadasEnviadas !== ocupadas) {
      ops.push({ tipo: 'ocupacion', sesionId: s.id, eventoId: vivo.eventoId, bookingCount: ocupadas });
    }
  }

  // Eventos vivos cuya sesión ya no existe (borrada en Tentare): se cancelan
  // allí. Quien llama tiene que pasar en `sesiones` TODAS las sesiones de los
  // eventos vivos, también las que ya empezaron o se movieron lejos — si no,
  // esto cancelaría en USC una clase que sigue existiendo.
  const vistas = new Set(p.sesiones.map(s => s.id));
  for (const e of p.eventos) {
    if (!e.cancelado && (!e.sesionId || !vistas.has(e.sesionId))) ops.push({ tipo: 'cancelar', sesionId: e.sesionId, eventoId: e.eventoId });
  }

  // Primero lo que quita plazas (cancelar), luego lo que las cambia, y lo
  // último lo que solo crea: si la pasada se corta por tope de llamadas, que no
  // quede abierto en USC algo que en Tentare ya no existe.
  const orden = { cancelar: 0, recrear: 1, editar: 2, ocupacion: 3, crear: 4 } as const;
  return ops.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

/** Nombre de la instructora partido como lo pide USC (nombre obligatorio). */
export function nombreTrainerUsc(nombre: string): { firstName: string; lastName?: string } {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { firstName: 'Instructora' };
  if (partes.length === 1) return { firstName: partes[0] };
  return { firstName: partes[0], lastName: partes.slice(1).join(' ') };
}

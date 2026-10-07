// Qué hay que decirle a Wellhub para que su app enseñe el horario de Tentare.
// Función pura: entra lo que hay en Tentare y lo que ya se envió, sale la lista
// de llamadas. Quien llama (lib/plataformas/wellhub/horario-servidor.ts) solo
// las ejecuta y guarda el resultado. Mismo planteamiento que USC
// (lib/plataformas/usc/horario.ts); lo que cambia es su API:
//
//  · Dos niveles: una «clase» de Wellhub es un tipo de actividad (aquí, un tipo
//    de clase de Tentare, `reference` = su id) y un «slot» es una clase en un
//    día y hora (aquí, una sesión). El slot cuelga de su clase.
//  · Un slot se puede editar entero (PUT), hora incluida: no hace falta cancelar
//    y recrear como en USC. Borrarlo cancela allí sus reservas (nos llegan por
//    webhook y se cancelan aquí).
//  · Una clase no se borra: se oculta (`visible: false`).
//  · `occur_date` va en hora LOCAL del estudio con su offset.
//  · `cancellable_until` como mucho 24 h antes: Wellhub no admite más.
//  · Producto obligatorio en clases y slots: el que el estudio elige al conectar.
//
// Qué se publica: las clases cuyo tipo (o la propia sesión) tiene plazas
// cedidas a Wellhub (`plataforma_cupos`), a dos semanas vista. Ceder plazas es
// la forma de decir «esta clase va a Wellhub».
//
// `total_booked`: Wellhub enseña como libres `total_capacity - total_booked`, y
// lo mantenemos NOSOTROS con todas las reservas (las suyas incluidas). Se
// calcula para que nunca enseñe más huecos de los reales: libres =
// min(cedidas − reservas de Wellhub, aforo − todas). Si aun así vende uno que
// ya no está (carrera entre dos pasadas), la RPC de la reserva lo rechaza.

import { TZ_ESTUDIO } from '../../utils.ts';

export const VENTANA_PUBLICACION_DIAS_WELLHUB = 14;
/** Wellhub recorta la ventana de cancelación a 24 h antes del inicio. */
export const MAX_CANCELACION_HORAS_WELLHUB = 24;
const MAX_DURACION_MIN = 200;

export interface ConfigWellhub {
  gymId: string;
  productId: number;
  zonaHoraria?: string;
}

/** El gym y el producto de Wellhub de un estudio, o null si va en modo manual. */
export function configWellhubDe(config: unknown): ConfigWellhub | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const gymId = typeof c.gymId === 'string' ? c.gymId.trim() : '';
  const productId = Number(typeof c.productId === 'string' ? c.productId.trim() : c.productId);
  if (!/^\d{1,18}$/.test(gymId) || !Number.isSafeInteger(productId) || productId <= 0) return null;
  return { gymId, productId };
}

/**
 * ¿Publica este estudio en Wellhub ahora mismo? Necesita gym y producto Y no
 * estar en modo manual. Al volver a manual se CONSERVAN: hacen falta para
 * quitar allí lo que ya se publicó.
 */
export function wellhubPublicaPorApi(config: unknown): boolean {
  return configWellhubDe(config) !== null && (config as Record<string, unknown> | null)?.modo !== 'manual';
}

export interface TipoParaWellhub {
  id: string;
  nombre: string;
  descripcion: string | null;
}

export interface SesionParaWellhub {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
  aforo: number;
  tipoClaseId: string | null;
  sala: string | null;
  instructora: string | null;
  /** Ventana de cancelación del tipo (o del estudio), en horas. */
  cancelacionHoras: number | null;
  /** Plazas cedidas a Wellhub ya resueltas (sesión → tipo). null = sin ceder. */
  cupo: number | null;
  /** CONFIRMADA/ASISTIDA de cualquier origen. */
  ocupadas: number;
  /** De ellas, las que vienen de Wellhub. */
  ocupadasWellhub: number;
}

export interface ClaseWellhubGuardada {
  /** null = el tipo de clase se borró en Tentare. */
  tipoClaseId: string | null;
  /** El gym en el que se publicó (puede no ser el de la conexión de hoy). */
  gymId: string;
  claseId: string;
  visible: boolean;
  huella: string | null;
}

export interface SlotWellhubGuardado {
  /** null = la sesión se borró en Tentare: el slot sigue vivo allí. */
  sesionId: string | null;
  slotId: string;
  claseId: string;
  borrado: boolean;
  huella: string | null;
  ocupadasEnviadas: number | null;
}

export interface CuerpoClaseWellhub {
  name: string;
  description: string;
  bookable: boolean;
  visible: boolean;
  product_id: number;
  reference: string;
}

export interface CuerpoSlotWellhub {
  occur_date: string;
  room?: string;
  status: 1;
  length_in_minutes: number;
  total_capacity: number;
  total_booked: number;
  product_id: number;
  cancellable_until: string;
  instructors: { name: string; substitute: boolean }[];
}

export type OperacionWellhub =
  | { tipo: 'crear-clase'; tipoClaseId: string; cuerpo: CuerpoClaseWellhub; huella: string }
  | { tipo: 'editar-clase'; tipoClaseId: string; claseId: string; cuerpo: CuerpoClaseWellhub; huella: string }
  | { tipo: 'ocultar-clase'; tipoClaseId: string | null; claseId: string }
  | { tipo: 'borrar-slot'; sesionId: string | null; claseId: string; slotId: string }
  | { tipo: 'crear-slot'; sesionId: string; tipoClaseId: string; cuerpo: CuerpoSlotWellhub; huella: string }
  | { tipo: 'editar-slot'; sesionId: string; claseId: string; slotId: string; cuerpo: CuerpoSlotWellhub; huella: string }
  | {
    tipo: 'aforo-slot'; sesionId: string; claseId: string; slotId: string; total_capacity: number; total_booked: number;
    /** Solo al dejar de vender (`HUELLA_SIN_VENTA`): así, si vuelve a tener plazas, se edita entero. */
    huella?: string;
  };

/**
 * Huella de un slot que se ha dejado de vender sin borrarlo (le quedan socias de
 * Wellhub apuntadas): no coincide con ninguna huella real, así que en cuanto la
 * clase vuelva a tener plazas cedidas se reescribe entero.
 */
export const HUELLA_SIN_VENTA = 'sin-venta';

/** Plazas que se publican: lo cedido, nunca más que el aforo. 0 = no se publica. */
export function plazasWellhub(cupo: number | null, aforo: number): number {
  if (cupo == null) return 0;
  return Math.max(0, Math.min(cupo, aforo));
}

/** Ver cabecera. Siempre entre 0 y lo publicado. */
export function totalBookedWellhub(publicadas: number, aforo: number, ocupadas: number, ocupadasWellhub: number): number {
  const libres = Math.max(0, Math.min(publicadas - ocupadasWellhub, aforo - ocupadas));
  return Math.min(publicadas, Math.max(0, publicadas - libres));
}

/**
 * El instante en hora local del estudio con su offset, como lo pide Wellhub
 * («2019-07-30T10:00:00-05:00»). El offset sale de la zona horaria en ESE
 * instante (verano/invierno).
 */
export function fechaLocalWellhub(iso: string, tz: string = TZ_ESTUDIO): string {
  const d = new Date(iso);
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(d);
  const v = (t: string) => partes.find(p => p.type === t)?.value ?? '00';
  const zona = v('timeZoneName'); // «GMT+02:00», o «GMT» a secas en UTC
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(zona);
  const offset = m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00';
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}${offset}`;
}

export function duracionWellhub(inicio: string, fin: string): number {
  const min = Math.round((Date.parse(fin) - Date.parse(inicio)) / 60000);
  return Math.min(MAX_DURACION_MIN, Math.max(1, min));
}

/** Hasta cuándo se cancela sin que sea tardía: la ventana del tipo o del estudio, como mucho 24 h. */
export function cancelableHastaWellhub(inicio: string, horas: number | null, tz?: string): string {
  const h = Math.min(MAX_CANCELACION_HORAS_WELLHUB, Math.max(0, horas ?? 0));
  return fechaLocalWellhub(new Date(Date.parse(inicio) - h * 3_600_000).toISOString(), tz);
}

export function cuerpoClaseWellhub(t: TipoParaWellhub, cfg: ConfigWellhub): CuerpoClaseWellhub {
  const nombre = t.nombre.trim() || 'Clase';
  return {
    name: nombre.slice(0, 255),
    // Obligatoria en su API: sin descripción propia, el nombre.
    description: ((t.descripcion ?? '').trim() || nombre).slice(0, 2000),
    bookable: true,
    visible: true,
    product_id: cfg.productId,
    reference: t.id,
  };
}

export function cuerpoSlotWellhub(s: SesionParaWellhub, cfg: ConfigWellhub): CuerpoSlotWellhub {
  const publicadas = plazasWellhub(s.cupo, s.aforo);
  const sala = (s.sala ?? '').trim();
  const instructora = (s.instructora ?? '').trim().slice(0, 100);
  return {
    occur_date: fechaLocalWellhub(s.inicio, cfg.zonaHoraria),
    // Su API exige 2–200 caracteres; si no, sin sala.
    ...(sala.length >= 2 ? { room: sala.slice(0, 200) } : {}),
    status: 1,
    length_in_minutes: duracionWellhub(s.inicio, s.fin),
    total_capacity: publicadas,
    total_booked: totalBookedWellhub(publicadas, s.aforo, s.ocupadas, s.ocupadasWellhub),
    product_id: cfg.productId,
    cancellable_until: cancelableHastaWellhub(s.inicio, s.cancelacionHoras, cfg.zonaHoraria),
    instructors: instructora ? [{ name: instructora, substitute: false }] : [],
  };
}

export function huellaClaseWellhub(c: CuerpoClaseWellhub): string {
  return JSON.stringify([c.name, c.description, c.product_id]);
}

/** Todo lo del slot menos `total_booked`, que va aparte (PATCH de aforo, más barato). */
export function huellaSlotWellhub(c: CuerpoSlotWellhub): string {
  return JSON.stringify([c.occur_date, c.room ?? null, c.length_in_minutes, c.total_capacity, c.product_id, c.cancellable_until, c.instructors]);
}

export function planificarHorarioWellhub(p: {
  sesiones: SesionParaWellhub[];
  tipos: TipoParaWellhub[];
  clases: ClaseWellhubGuardada[];
  slots: SlotWellhubGuardado[];
  config: ConfigWellhub;
  ahora: number;
  /**
   * false = el estudio ya no vende en Wellhub (apagado o sin conexión): se
   * retira todo lo publicado con las mismas reglas que una clase sin plazas
   * (se deja de vender lo que tiene socias de Wellhub; el resto se borra).
   */
  publicar?: boolean;
}): OperacionWellhub[] {
  const limite = p.ahora + VENTANA_PUBLICACION_DIAS_WELLHUB * 86_400_000;
  const publicar = p.publicar !== false;
  const tipoPorId = new Map(p.tipos.map(t => [t.id, t]));
  // Solo las clases del gym de hoy sirven para publicar: las de otro gym (el
  // estudio cambió de gym) se retiran como si su tipo no tuviera plazas.
  const clasePorTipo = new Map(p.clases.filter(c => c.tipoClaseId && c.gymId === p.config.gymId)
    .map(c => [c.tipoClaseId as string, c]));
  const slotPorSesion = new Map(p.slots.filter(s => s.sesionId && !s.borrado).map(s => [s.sesionId as string, s]));
  const ops: OperacionWellhub[] = [];
  const tiposConSlot = new Set<string>();
  const clasesNuevas = new Set<string>();

  for (const s of [...p.sesiones].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const inicio = Date.parse(s.inicio);
    if (!(inicio > p.ahora)) continue; // empezada o pasada: ni se crea ni se toca
    const vivo = slotPorSesion.get(s.id) ?? null;
    const tipo = s.tipoClaseId ? tipoPorId.get(s.tipoClaseId) ?? null : null;
    const publicadas = plazasWellhub(s.cupo, s.aforo);
    const debePublicarse = publicar && !s.cancelada && publicadas > 0 && inicio <= limite && !!tipo;

    if (!debePublicarse || !tipo) {
      if (!vivo) continue;
      // La clase sigue en pie y aún hay socias de Wellhub con plaza: borrar el
      // slot cancelaría sus reservas allí. Se deja de vender (capacidad = las
      // que hay) y se respeta lo ya vendido.
      if (!s.cancelada && s.ocupadasWellhub > 0) {
        if (vivo.huella !== HUELLA_SIN_VENTA || vivo.ocupadasEnviadas !== s.ocupadasWellhub) {
          ops.push({
            tipo: 'aforo-slot', sesionId: s.id, claseId: vivo.claseId, slotId: vivo.slotId,
            total_capacity: s.ocupadasWellhub, total_booked: s.ocupadasWellhub, huella: HUELLA_SIN_VENTA,
          });
        }
        continue;
      }
      ops.push({ tipo: 'borrar-slot', sesionId: s.id, claseId: vivo.claseId, slotId: vivo.slotId });
      continue;
    }
    tiposConSlot.add(tipo.id);

    const cuerpoClase = cuerpoClaseWellhub(tipo, p.config);
    const huellaClase = huellaClaseWellhub(cuerpoClase);
    const clase = clasePorTipo.get(tipo.id) ?? null;
    if (!clase && !clasesNuevas.has(tipo.id)) {
      ops.push({ tipo: 'crear-clase', tipoClaseId: tipo.id, cuerpo: cuerpoClase, huella: huellaClase });
      clasesNuevas.add(tipo.id);
    } else if (clase && (clase.huella !== huellaClase || !clase.visible) && !clasesNuevas.has(tipo.id)) {
      ops.push({ tipo: 'editar-clase', tipoClaseId: tipo.id, claseId: clase.claseId, cuerpo: cuerpoClase, huella: huellaClase });
      clasesNuevas.add(tipo.id); // una edición por clase y pasada
    }

    const cuerpo = cuerpoSlotWellhub(s, p.config);
    const huella = huellaSlotWellhub(cuerpo);
    // Su slot cuelga de otra clase (la sesión cambió de tipo, o el estudio de
    // gym y la clase de hoy aún se está creando): se borra y se crea en la
    // vigente. Si ya tiene socias de Wellhub, no se mueve —borrarlo cancelaría
    // sus reservas allí— hasta que no quede ninguna, y mientras tanto deja de
    // vender: lo que entrara ahí sería otra clase, o de un gym que ya no es el
    // del estudio (y se rechazaría).
    if (vivo && vivo.claseId !== (clase?.claseId ?? null)) {
      if (s.ocupadasWellhub === 0) {
        ops.push({ tipo: 'borrar-slot', sesionId: s.id, claseId: vivo.claseId, slotId: vivo.slotId });
        ops.push({ tipo: 'crear-slot', sesionId: s.id, tipoClaseId: tipo.id, cuerpo, huella });
      } else if (vivo.huella !== HUELLA_SIN_VENTA || vivo.ocupadasEnviadas !== s.ocupadasWellhub) {
        ops.push({
          tipo: 'aforo-slot', sesionId: s.id, claseId: vivo.claseId, slotId: vivo.slotId,
          total_capacity: s.ocupadasWellhub, total_booked: s.ocupadasWellhub, huella: HUELLA_SIN_VENTA,
        });
      }
      continue;
    }
    if (!vivo) {
      ops.push({ tipo: 'crear-slot', sesionId: s.id, tipoClaseId: tipo.id, cuerpo, huella });
      continue;
    }
    if (vivo.huella !== huella) {
      ops.push({ tipo: 'editar-slot', sesionId: s.id, claseId: vivo.claseId, slotId: vivo.slotId, cuerpo, huella });
    } else if (vivo.ocupadasEnviadas !== cuerpo.total_booked) {
      ops.push({
        tipo: 'aforo-slot', sesionId: s.id, claseId: vivo.claseId, slotId: vivo.slotId,
        total_capacity: cuerpo.total_capacity, total_booked: cuerpo.total_booked,
      });
    }
  }

  // Slots vivos cuya sesión ya no existe (borrada en Tentare): se borran allí.
  // Quien llama tiene que pasar en `sesiones` TODAS las sesiones de los slots
  // vivos, también las que ya empezaron o se movieron lejos — si no, esto
  // borraría en Wellhub una clase que sigue existiendo.
  const vistas = new Set(p.sesiones.map(s => s.id));
  for (const sl of p.slots) {
    if (!sl.borrado && (!sl.sesionId || !vistas.has(sl.sesionId))) {
      ops.push({ tipo: 'borrar-slot', sesionId: sl.sesionId, claseId: sl.claseId, slotId: sl.slotId });
    }
  }

  // Clases visibles cuyo tipo ya no tiene nada que publicar en la ventana (o se
  // borró) y a las que no les queda ningún slot futuro vivo: se ocultan
  // (ocultar una clase oculta también sus slots). Si el tipo vuelve a tener
  // plazas, se edita y vuelve a ser visible.
  const futuras = new Set(p.sesiones.filter(s => Date.parse(s.inicio) > p.ahora).map(s => s.id));
  const borrados = new Set(ops.flatMap(o => (o.tipo === 'borrar-slot' ? [o.slotId] : [])));
  const conSlotFuturo = new Set(p.slots
    .filter(sl => !sl.borrado && !borrados.has(sl.slotId) && sl.sesionId && futuras.has(sl.sesionId))
    .map(sl => sl.claseId));
  for (const c of p.clases) {
    if (!c.visible) continue;
    if (c.tipoClaseId && c.gymId === p.config.gymId && tiposConSlot.has(c.tipoClaseId)) continue;
    if (conSlotFuturo.has(c.claseId)) continue;
    ops.push({ tipo: 'ocultar-clase', tipoClaseId: c.tipoClaseId, claseId: c.claseId });
  }

  // Primero lo que quita plazas (borrar), luego clases (los slots nuevos las
  // necesitan), luego cambios de slots, y lo último lo que solo crea: si la
  // pasada se corta por tope de llamadas, que no quede abierto en Wellhub algo
  // que en Tentare ya no existe.
  const orden: Record<OperacionWellhub['tipo'], number> = {
    'borrar-slot': 0, 'ocultar-clase': 1, 'crear-clase': 2, 'editar-clase': 3,
    'editar-slot': 4, 'aforo-slot': 5, 'crear-slot': 6,
  };
  return ops.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

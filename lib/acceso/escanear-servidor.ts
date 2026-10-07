// Leer el QR de una alumna en la puerta: identificarla, comprobar su acceso a
// la clase de ahora, actuar y dejarlo registrado.
//
// Lo comparten el panel (recepción) y la app de la instructora. Cada ruta
// autentica a su manera —sesión de personal en el panel, instructora del slug
// en la app— y le pasa aquí quién escanea y cómo se marca la asistencia en su
// caso (`Marcadores`): el panel con `checkinPublico`, la app con
// `marcarAsistencia` de su lista, que ya la limita a SUS clases. Mismo criterio
// que `mi-disponibilidad` frente a `public/disponibilidad`: dos puertas, una
// sola regla de negocio.
//
// Lo que NO hace, a propósito:
//   · decidir con reglas propias: `evaluarAcceso` lee el estado de su reserva;
//   · escribir NO_ASISTIO (dispara penalizaciones: eso lo decide el estudio);
//   · confiar en el cliente para el estudio o la alumna: el estudio sale de la
//     sesión de quien escanea y la alumna, del token.
//
// Service-role: `socios_qr_acceso` y la escritura de `accesos_escaneos` no
// tienen grants para el cliente.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashTokenQr, leerTokenQr } from '@/lib/acceso/qr-token';
import {
  evaluarAcceso, MINUTOS_ANTES_DE_EMPEZAR,
  type AvisoRevisar, type ClaseEnPuerta, type MotivoAcceso, type ReservaEnPuerta, type TipoAcceso, type Veredicto,
} from '@/lib/acceso/evaluar-acceso';
import { sePasaLista } from '@/lib/checkin/pasar-lista';
import { sesionEncajaEnPlaza } from '@/lib/plazas-fijas-slot';
import { idSuscripcionPrueba } from '@/lib/billing/clase-prueba';
import { nombresParaLista } from '@/lib/student/agenda-instructora';
import { resolverReservaPendiente } from '@/lib/db/supabase-data-admin';
import type { PlazaFija } from '@/lib/types';
import { esReservaPlazaFija } from '../reservas/plaza-fija-id.ts';

export type Origen = 'PANEL' | 'APP_INSTRUCTORA';
export type AccionAcceso = 'APROBAR' | 'DEJAR_PASAR' | 'NO_PERMITIR';
/** `disponible` = el estudio tiene Kisi y se puede abrir con el botón; nunca se abre sola. */
export type EstadoPuerta = 'sin-kisi' | 'disponible' | 'abierta' | 'fallo';

export interface Actor {
  uid: string;
  rol: string;
  studioId: string;
  origen: Origen;
  /** Solo en la app de la instructora: se comprueban SUS clases y nada más. */
  instructorId?: string;
  /** Puede aprobar una reserva pendiente (`puedeGestionarCalendario`). */
  puedeAprobar: boolean;
}

export interface Marcadores {
  /** Marca ASISTIDA con el dueño de siempre de su puerta. */
  marcar(reservaId: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Solo recepción: ¿hay puerta de Kisi? */
  tienePuerta?(): Promise<boolean>;
  /** Solo recepción, y solo cuando alguien pulsa «Abrir la puerta». */
  abrirPuerta?(): Promise<'abierta' | 'fallo'>;
}

export interface ClaseDetalle {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
  nombre: string;
  sala: string | null;
  instructora: string | null;
}

/** Lo que ve quien escanea. `ESTADO_A_REVISAR` es el 🟠 de desactivada/impago
 *  contado a la instructora, que no tiene por qué saber de dinero. */
export interface RespuestaEscaneo {
  escaneoId: number | null;
  veredicto: Veredicto;
  motivo: MotivoAcceso | 'ESTADO_A_REVISAR';
  alumna: { nombre: string; foto: string | null } | null;
  clase: ClaseDetalle | null;
  otraClase: ClaseDetalle | null;
  candidatas: ClaseDetalle[];
  tipoAcceso: TipoAcceso | null;
  /** Solo plaza fija. `hasta: null` = sin fecha de fin. */
  plazaFija: { hasta: string | null } | null;
  estadoReserva: string | null;
  reservaId: string | null;
  avisos: AvisoRevisar[];
  yaEntroEn: string | null;
  asistenciaMarcada: boolean;
  /** La clase no pasa lista: la asistencia se marca sola al terminar. */
  asistenciaAlTerminar: boolean;
  errorAsistencia: string | null;
  puerta: EstadoPuerta;
  acciones: AccionAcceso[];
  /** La clase ya ha empezado: una reserva pendiente no se puede aprobar ya. */
  claseEmpezada: boolean;
}

export type ErrorEscaneo = { error: string; status: 400 | 403 | 404 | 409 };

type Admin = SupabaseClient;

export interface FilaSesion { id: string; inicio: string; fin: string; cancelada: boolean | null; tipo_clase_id: string | null; sala_id: string | null; instructor_id: string | null }
interface FilaEstudio { control_acceso_qr: boolean | null; requiere_checkin_qr: boolean | null; bloquear_reserva_impago: boolean | null }

export const COLS_SESION = 'id, inicio, fin, cancelada, tipo_clase_id, sala_id, instructor_id';
const MIN = 60_000;

const aClase = (s: FilaSesion): ClaseEnPuerta => ({ id: s.id, inicio: s.inicio, fin: s.fin, cancelada: s.cancelada === true });

async function estudio(admin: Admin, studioId: string): Promise<FilaEstudio> {
  const { data, error } = await admin.from('studios')
    .select('control_acceso_qr, requiere_checkin_qr, bloquear_reserva_impago').eq('id', studioId).single();
  if (error) throw error;
  return data as FilaEstudio;
}

/** Las clases de ahora del estudio (o de la instructora): desde una hora antes hasta que terminan. */
async function sesionesDeAhora(admin: Admin, actor: Actor, ahoraMs: number): Promise<FilaSesion[]> {
  let q = admin.from('sesiones').select(COLS_SESION)
    .eq('studio_id', actor.studioId)
    .lte('inicio', new Date(ahoraMs + MINUTOS_ANTES_DE_EMPEZAR * MIN).toISOString())
    .gte('fin', new Date(ahoraMs).toISOString())
    .order('inicio', { ascending: true })
    .limit(30);
  if (actor.instructorId) q = q.eq('instructor_id', actor.instructorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FilaSesion[];
}

/** Nombre de la clase, sala e instructora, para pintar. También lo usa el historial. */
export async function detallar(admin: Admin, studioId: string, sesiones: FilaSesion[]): Promise<Map<string, ClaseDetalle>> {
  const ids = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const tipos = ids(sesiones.map(s => s.tipo_clase_id));
  const salas = ids(sesiones.map(s => s.sala_id));
  const instructoras = ids(sesiones.map(s => s.instructor_id));
  const nombres = async (tabla: string, lista: string[]) => {
    if (!lista.length) return new Map<string, string>();
    const { data } = await admin.from(tabla).select('id, nombre').eq('studio_id', studioId).in('id', lista);
    return new Map(((data ?? []) as { id: string; nombre: string }[]).map(r => [r.id, r.nombre]));
  };
  const [nt, ns, ni] = await Promise.all([nombres('tipos_clase', tipos), nombres('salas', salas), nombres('instructores', instructoras)]);
  return new Map(sesiones.map(s => [s.id, {
    ...aClase(s),
    nombre: (s.tipo_clase_id && nt.get(s.tipo_clase_id)) || 'Clase',
    sala: (s.sala_id && ns.get(s.sala_id)) || null,
    instructora: (s.instructor_id && ni.get(s.instructor_id)) || null,
  }]));
}

async function pasaLista(admin: Admin, studioId: string, sesion: FilaSesion, porEstudio: boolean | null): Promise<boolean> {
  let override: boolean | null = null;
  if (sesion.tipo_clase_id) {
    const { data } = await admin.from('tipos_clase').select('requiere_checkin_qr').eq('id', sesion.tipo_clase_id).maybeSingle();
    override = (data as { requiere_checkin_qr: boolean | null } | null)?.requiere_checkin_qr ?? null;
  }
  return sePasaLista(
    { id: sesion.id, studioId, tipoClaseId: sesion.tipo_clase_id },
    new Map([[studioId, porEstudio]]),
    new Map(sesion.tipo_clase_id ? [[sesion.tipo_clase_id, override]] : []),
  );
}

interface FilaRegistro {
  socio_id: string | null; sesion_id: string | null; reserva_id: string | null;
  resultado: Veredicto; motivo: MotivoAcceso; asistencia_marcada?: boolean;
  decision?: AccionAcceso; decision_de?: number;
}

/**
 * Deja el escaneo en el historial. Fail-open: si el registro falla, la puerta
 * no se queda cerrada por eso (se avisa en el log del servidor). La excepción es
 * la decisión tras un 🟠, que necesita su fila para no decidirse dos veces: ahí
 * el error sube al llamador.
 */
async function registrar(admin: Admin, actor: Actor, f: FilaRegistro): Promise<{ id: number | null; duplicada: boolean }> {
  const { data, error } = await admin.from('accesos_escaneos').insert({
    studio_id: actor.studioId, actor_uid: actor.uid, actor_rol: actor.rol, origen: actor.origen,
    socio_id: f.socio_id, sesion_id: f.sesion_id, reserva_id: f.reserva_id,
    resultado: f.resultado, motivo: f.motivo, asistencia_marcada: f.asistencia_marcada ?? false,
    decision: f.decision ?? null, decision_de: f.decision_de ?? null,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return { id: null, duplicada: true };
    console.error('[acceso] no se pudo registrar el escaneo', error.message);
    return { id: null, duplicada: false };
  }
  return { id: (data as { id: number }).id, duplicada: false };
}

/** La foto de una socia vive en `avatars-privadas` con su id como ruta (ver /api/foto/signed-url). */
async function fotoFirmada(admin: Admin, socioId: string): Promise<string | null> {
  try {
    const { data } = await admin.storage.from('avatars-privadas').createSignedUrl(socioId, 600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

function vacia(p: Partial<RespuestaEscaneo> & Pick<RespuestaEscaneo, 'veredicto' | 'motivo'>): RespuestaEscaneo {
  return {
    escaneoId: null, alumna: null, clase: null, otraClase: null, candidatas: [], tipoAcceso: null, plazaFija: null,
    estadoReserva: null, reservaId: null, avisos: [], yaEntroEn: null, asistenciaMarcada: false, asistenciaAlTerminar: false,
    errorAsistencia: null, puerta: 'sin-kisi', acciones: [], claseEmpezada: false, ...p,
  };
}

/** ¿Hasta cuándo es suya esa franja? La plaza no se guarda en la reserva: se empareja por slot. */
async function vigenciaPlazaFija(admin: Admin, studioId: string, socioId: string, sesion: FilaSesion): Promise<{ hasta: string | null } | null> {
  const { data } = await admin.from('plazas_fijas')
    .select('id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, creada_en')
    .eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'ACTIVA');
  const plazas: PlazaFija[] = ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string, studioId: r.studio_id as string, socioId: r.socio_id as string,
    diaSemana: r.dia_semana as number, horaInicio: r.hora_inicio as string, salaId: r.sala_id as string,
    tipoClaseId: (r.tipo_clase_id as string | null) ?? null, spotId: (r.spot_id as string | null) ?? null,
    vigenciaDesde: r.vigencia_desde as string, vigenciaHasta: (r.vigencia_hasta as string | null) ?? null,
    estado: 'ACTIVA', creadaEn: r.creada_en as string,
  }));
  // Una plaza fija siempre es de una sala; una clase sin sala no encaja en ninguna.
  if (!sesion.sala_id) return null;
  const slot = { salaId: sesion.sala_id, tipoClaseId: sesion.tipo_clase_id ?? '', inicio: sesion.inicio };
  const pf = plazas.find(p => sesionEncajaEnPlaza(p, slot));
  return pf ? { hasta: pf.vigenciaHasta } : null;
}

const MOTIVOS_DE_ESTADO: ReadonlySet<MotivoAcceso> = new Set(['CLIENTA_DESACTIVADA', 'IMPAGO']);

function accionesPara(actor: Actor, veredicto: Veredicto, motivo: MotivoAcceso, claseEmpezada: boolean): AccionAcceso[] {
  if (veredicto !== 'REVISAR') return [];
  // Una pendiente no se aprueba después de empezar la clase: lo impide la RPC
  // (la cancelaría y avisaría a la alumna). No se ofrece un botón que no puede salir bien.
  if (motivo === 'PENDIENTE_APROBACION') return actor.puedeAprobar && !claseEmpezada ? ['APROBAR', 'NO_PERMITIR'] : ['NO_PERMITIR'];
  if (MOTIVOS_DE_ESTADO.has(motivo)) return ['DEJAR_PASAR', 'NO_PERMITIR'];
  return [];
}

/** Lo que se le cuenta a cada quien: la instructora ve el nombre corto y ningún dato de dinero. */
function paraAudiencia(actor: Actor, r: RespuestaEscaneo): RespuestaEscaneo {
  if (!actor.instructorId) return r;
  return {
    ...r,
    motivo: MOTIVOS_DE_ESTADO.has(r.motivo as MotivoAcceso) ? 'ESTADO_A_REVISAR' : r.motivo,
    avisos: [],
  };
}

export async function escanearQr(
  admin: Admin, actor: Actor, m: Marcadores,
  p: { lectura: string; sesionId: string | null; ahora?: Date },
): Promise<RespuestaEscaneo | ErrorEscaneo> {
  const ahoraMs = (p.ahora ?? new Date()).getTime();
  const est = await estudio(admin, actor.studioId);
  if (est.control_acceso_qr === false) return { error: 'El control de acceso con QR está desactivado en este estudio.', status: 403 };

  // ── La clase, si ya se sabe ────────────────────────────────────────────────
  let elegida: FilaSesion | null = null;
  if (p.sesionId) {
    let q = admin.from('sesiones').select(COLS_SESION).eq('id', p.sesionId).eq('studio_id', actor.studioId);
    // Una clase ajena responde igual que una que no existe.
    if (actor.instructorId) q = q.eq('instructor_id', actor.instructorId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    if (!data) return { error: 'No encontramos esta clase.', status: 404 };
    elegida = data as FilaSesion;
  } else if (actor.instructorId) {
    return { error: 'Falta la clase que estás comprobando.', status: 400 };
  }

  // ── ¿Quién es? ────────────────────────────────────────────────────────────
  const sinAlumna = async (motivo: MotivoAcceso, socioId: string | null = null, alumna: RespuestaEscaneo['alumna'] = null) => {
    const reg = await registrar(admin, actor, { socio_id: socioId, sesion_id: elegida?.id ?? null, reserva_id: null, resultado: 'DENEGADO', motivo });
    const clase = elegida ? (await detallar(admin, actor.studioId, [elegida])).get(elegida.id) ?? null : null;
    return vacia({ veredicto: 'DENEGADO', motivo, escaneoId: reg.id, alumna, clase });
  };

  const token = leerTokenQr(p.lectura);
  if (!token) return sinAlumna('QR_NO_RECONOCIDO');
  const { data: fila, error: eQr } = await admin.from('socios_qr_acceso')
    .select('studio_id, socio_id, revocado_en').eq('token_hash', hashTokenQr(token)).maybeSingle();
  if (eQr) throw eQr;
  if (!fila) return sinAlumna('QR_NO_RECONOCIDO');
  // De otro estudio: ni su nombre ni su id quedan en el registro de ESTE.
  if (fila.studio_id !== actor.studioId) return sinAlumna('QR_OTRO_ESTUDIO');
  const socioId = fila.socio_id as string;

  const { data: socia, error: eSocia } = await admin.from('socios')
    .select('nombre, apellidos, foto_url, activo, borrado_en')
    .eq('id', socioId).eq('studio_id', actor.studioId).maybeSingle();
  if (eSocia) throw eSocia;
  if (!socia || socia.borrado_en) return sinAlumna('QR_NO_RECONOCIDO');
  const alumna = {
    nombre: actor.instructorId
      ? nombresParaLista([{ nombre: socia.nombre as string, apellidos: socia.apellidos as string | null }])[0]
      : [socia.nombre, socia.apellidos].filter(Boolean).join(' '),
    // Para comparar la cara con quien está en la puerta: es lo que hace inútil
    // una captura prestada. El bucket es privado (SEC-01), así que va firmada y
    // corta; sin foto o si falla la firma, se enseña sin ella.
    // ⚠️ Solo al personal que puede ver fichas: la RLS del bucket
    // (`puede_gestionar_clientas`) no deja a la instructora ver fotos de
    // socias, y firmarla aquí se la daría por la puerta de atrás.
    foto: socia.foto_url && !actor.instructorId ? await fotoFirmada(admin, socioId) : null,
  };
  if (fila.revocado_en) return sinAlumna('QR_SUSTITUIDO', socioId, alumna);

  // ── Su situación ahora ─────────────────────────────────────────────────────
  const deAhora = await sesionesDeAhora(admin, actor, ahoraMs);
  const sesiones = new Map<string, FilaSesion>(deAhora.map(s => [s.id, s]));
  if (elegida) sesiones.set(elegida.id, elegida);

  const { data: filasReserva, error: eRes } = await admin.from('reservas')
    .select('id, sesion_id, estado, check_in_en, creado_en, bono_suscripcion_id')
    .eq('studio_id', actor.studioId).eq('socio_id', socioId).in('sesion_id', [...sesiones.keys()].length ? [...sesiones.keys()] : ['-']);
  if (eRes) throw eRes;
  const reservasCrudas = (filasReserva ?? []) as { id: string; sesion_id: string; estado: string; check_in_en: string | null; creado_en: string | null; bono_suscripcion_id: string | null }[];

  const [recuperadas, conImpago] = await Promise.all([
    reservasCrudas.length
      ? admin.from('recuperaciones').select('usada_en_reserva_id').eq('studio_id', actor.studioId).in('usada_en_reserva_id', reservasCrudas.map(r => r.id))
        .then(({ data }) => new Set(((data ?? []) as { usada_en_reserva_id: string }[]).map(r => r.usada_en_reserva_id)))
      : Promise.resolve(new Set<string>()),
    // «Cuando corresponda»: la regla de impago que YA tiene el estudio. Si no
    // bloquea reservas por impago, tampoco se le para en la puerta.
    est.bloquear_reserva_impago
      ? admin.rpc('socio_tiene_impago', { p_studio_id: actor.studioId, p_socio_id: socioId }).then(({ data }) => data === true)
      : Promise.resolve(false),
  ]);

  const reservas: ReservaEnPuerta[] = reservasCrudas.map(r => ({
    id: r.id, sesionId: r.sesion_id, estado: r.estado, checkInEn: r.check_in_en, creadoEn: r.creado_en,
    esRecuperacion: recuperadas.has(r.id), esPrueba: r.bono_suscripcion_id === idSuscripcionPrueba(socioId),
  }));

  const ev = evaluarAcceso({
    ahoraMs,
    claseElegida: elegida ? aClase(elegida) : null,
    clasesAhora: deAhora.map(aClase),
    reservas,
    socia: { activa: socia.activo !== false, conImpago },
  });

  const detalles = await detallar(admin, actor.studioId, [...sesiones.values()]);
  const sesionDeLaClase = ev.clase ? sesiones.get(ev.clase.id) ?? null : null;
  const claseEmpezada = !!ev.clase && ahoraMs >= Date.parse(ev.clase.inicio);
  const plazaFija = ev.tipoAcceso === 'PLAZA_FIJA' && sesionDeLaClase
    ? await vigenciaPlazaFija(admin, actor.studioId, socioId, sesionDeLaClase) ?? { hasta: null }
    : null;

  // ── Actuar: solo con 🟢, y solo si no había entrado ya ────────────────────
  let asistenciaMarcada = false;
  let errorAsistencia: string | null = null;
  let puerta: EstadoPuerta = 'sin-kisi';
  const seLista = sesionDeLaClase ? await pasaLista(admin, actor.studioId, sesionDeLaClase, est.requiere_checkin_qr) : true;
  if (ev.veredicto === 'PERMITIDO' && ev.motivo !== 'YA_ENTRO' && ev.reserva) {
    if (seLista) {
      const r = await m.marcar(ev.reserva.id);
      if (r.ok) asistenciaMarcada = true;
      else errorAsistencia = r.error;
    }
    // La puerta NUNCA se abre sola con un QR permanente (decisión del
    // fundador, 28-sep): con el iPad desatendido, una captura compartida de
    // una alumna con reserva abriría el estudio. Se ofrece el botón y la abre
    // quien está mirando (`abrirPuertaTrasEscaneo`).
    if (m.tienePuerta && await m.tienePuerta()) puerta = 'disponible';
  }

  const reg = await registrar(admin, actor, {
    socio_id: socioId, sesion_id: ev.clase?.id ?? elegida?.id ?? null, reserva_id: ev.reserva?.id ?? null,
    resultado: ev.veredicto, motivo: ev.motivo, asistencia_marcada: asistenciaMarcada,
  });

  return paraAudiencia(actor, {
    escaneoId: reg.id,
    veredicto: ev.veredicto,
    motivo: ev.motivo,
    alumna,
    clase: ev.clase ? detalles.get(ev.clase.id) ?? null : null,
    otraClase: ev.otraClase ? detalles.get(ev.otraClase.id) ?? null : null,
    candidatas: ev.candidatas.map(c => detalles.get(c.id)).filter((c): c is ClaseDetalle => !!c),
    tipoAcceso: ev.tipoAcceso,
    plazaFija,
    estadoReserva: ev.reserva?.estado ?? null,
    reservaId: ev.reserva?.id ?? null,
    avisos: ev.avisos,
    yaEntroEn: ev.yaEntroEn,
    asistenciaMarcada,
    asistenciaAlTerminar: ev.veredicto === 'PERMITIDO' && !seLista,
    errorAsistencia,
    puerta,
    // Sin fila en el registro no hay decisión posible: la decisión cuelga de ella.
    acciones: reg.id != null ? accionesPara(actor, ev.veredicto, ev.motivo, claseEmpezada) : [],
    claseEmpezada,
  });
}

// ── Lo que se decide tras un 🟠 ─────────────────────────────────────────────

/** Cuánto vale un 🟠 para decidirlo. Pasado esto, se vuelve a escanear. */
const VIGENCIA_DECISION_MIN = 30;

export interface RespuestaDecision {
  escaneoId: number | null;
  veredicto: Veredicto;
  motivo: MotivoAcceso;
  asistenciaMarcada: boolean;
  asistenciaAlTerminar: boolean;
  errorAsistencia: string | null;
  puerta: EstadoPuerta;
}

export async function decidirEscaneo(
  admin: Admin, actor: Actor, m: Marcadores,
  p: { escaneoId: number; decision: AccionAcceso; ahora?: Date },
): Promise<RespuestaDecision | ErrorEscaneo> {
  const ahoraMs = (p.ahora ?? new Date()).getTime();
  const { data: fila, error } = await admin.from('accesos_escaneos')
    .select('id, ocurrido_en, socio_id, sesion_id, reserva_id, resultado, motivo, decision_de')
    .eq('id', p.escaneoId).eq('studio_id', actor.studioId).is('decision_de', null).maybeSingle();
  if (error) throw error;
  if (!fila) return { error: 'No encontramos ese escaneo.', status: 404 };
  const motivo = fila.motivo as MotivoAcceso;
  if (fila.resultado !== 'REVISAR' || !(motivo === 'PENDIENTE_APROBACION' || MOTIVOS_DE_ESTADO.has(motivo))) {
    return { error: 'Este escaneo no tiene nada que decidir.', status: 409 };
  }
  if (ahoraMs - Date.parse(fila.ocurrido_en as string) > VIGENCIA_DECISION_MIN * MIN) {
    return { error: 'Ha pasado demasiado rato. Vuelve a escanear su QR.', status: 409 };
  }
  if (!fila.reserva_id || !fila.sesion_id) return { error: 'Este escaneo no tiene nada que decidir.', status: 409 };

  let qs = admin.from('sesiones').select(COLS_SESION).eq('id', fila.sesion_id as string).eq('studio_id', actor.studioId);
  if (actor.instructorId) qs = qs.eq('instructor_id', actor.instructorId);
  const { data: sesion } = await qs.maybeSingle();
  if (!sesion) return { error: 'No encontramos esta clase.', status: 404 };
  // La clase, tal como está AHORA: pudo cancelarse o terminar desde el escaneo.
  if (p.decision !== 'NO_PERMITIR') {
    if ((sesion as FilaSesion).cancelada === true) return { error: 'Esta clase se ha cancelado. No puede entrar.', status: 409 };
    if (ahoraMs > Date.parse((sesion as FilaSesion).fin)) return { error: 'Esta clase ya ha terminado.', status: 409 };
  }
  // Ya decidido: se corta ANTES de actuar. El índice único de `decision_de`
  // impide la segunda fila; esto impide además la segunda acción (marcar,
  // abrir la puerta) en el caso normal de un doble toque. Dos peticiones a la
  // vez de dos personas pueden seguir cruzándose en esta ventana: la segunda se
  // queda sin fila (409) y `checkinPublico` es idempotente, así que no hay
  // doble crédito ni doble aprobación (la RPC bloquea la fila).
  const { data: yaDecidido } = await admin.from('accesos_escaneos').select('id').eq('decision_de', fila.id as number).maybeSingle();
  if (yaDecidido) return { error: 'Esto ya se decidió.', status: 409 };

  const est = await estudio(admin, actor.studioId);
  const base = { socio_id: fila.socio_id as string | null, sesion_id: fila.sesion_id as string, reserva_id: fila.reserva_id as string, decision: p.decision, decision_de: fila.id as number };
  const conRegistro = async (r: Omit<RespuestaDecision, 'escaneoId'>): Promise<RespuestaDecision | ErrorEscaneo> => {
    const reg = await registrar(admin, actor, { ...base, resultado: r.veredicto, motivo: r.motivo, asistencia_marcada: r.asistenciaMarcada });
    if (reg.duplicada) return { error: 'Esto ya se decidió.', status: 409 };
    return { ...r, escaneoId: reg.id };
  };
  const dejarPasar = async (reservaId: string, estado: string): Promise<Omit<RespuestaDecision, 'escaneoId'>> => {
    const seLista = await pasaLista(admin, actor.studioId, sesion as FilaSesion, est.requiere_checkin_qr);
    let asistenciaMarcada = false;
    let errorAsistencia: string | null = null;
    if (seLista && estado === 'CONFIRMADA') {
      const r = await m.marcar(reservaId);
      if (r.ok) asistenciaMarcada = true;
      else errorAsistencia = r.error;
    }
    // Igual que en el escaneo: la puerta se ofrece, no se abre sola.
    const puerta: EstadoPuerta = m.tienePuerta && await m.tienePuerta() ? 'disponible' : 'sin-kisi';
    return {
      veredicto: 'PERMITIDO', motivo: esReservaPlazaFija(reservaId) ? 'PLAZA_FIJA' : 'RESERVA_CONFIRMADA',
      asistenciaMarcada, asistenciaAlTerminar: !seLista, errorAsistencia, puerta,
    };
  };
  const denegar = (m2: MotivoAcceso): Omit<RespuestaDecision, 'escaneoId'> => ({
    veredicto: 'DENEGADO', motivo: m2, asistenciaMarcada: false, asistenciaAlTerminar: false, errorAsistencia: null, puerta: 'sin-kisi',
  });

  if (p.decision === 'NO_PERMITIR') return conRegistro(denegar('NO_PERMITIDO'));

  const { data: reserva } = await admin.from('reservas').select('id, estado')
    .eq('id', fila.reserva_id as string).eq('studio_id', actor.studioId).maybeSingle();
  if (!reserva) return { error: 'Esa reserva ya no existe.', status: 404 };
  const estado = reserva.estado as string;

  if (p.decision === 'DEJAR_PASAR') {
    if (motivo === 'PENDIENTE_APROBACION') return { error: 'Esta reserva hay que aprobarla antes.', status: 409 };
    if (estado !== 'CONFIRMADA' && estado !== 'ASISTIDA') return { error: 'Su reserva ha cambiado. Vuelve a escanear su QR.', status: 409 };
    return conRegistro(await dejarPasar(reserva.id as string, estado));
  }

  // APROBAR: con la aprobación de siempre, que revalida plan, límite semanal,
  // aforo y la regla «nunca después de empezar la clase».
  if (!actor.puedeAprobar) return { error: 'No tienes permiso para aprobar reservas.', status: 403 };
  if (motivo !== 'PENDIENTE_APROBACION') return { error: 'Esta reserva no está pendiente de aprobación.', status: 409 };
  const r = await resolverReservaPendiente({ studioId: actor.studioId, reservaId: reserva.id as string, aprobar: true });
  if ('error' in r) return { error: r.error, status: r.yaNoPendiente ? 409 : 400 };
  if (r.estado === 'CONFIRMADA') return conRegistro(await dejarPasar(reserva.id as string, 'CONFIRMADA'));
  if (r.estado === 'LISTA_ESPERA') return conRegistro(denegar('APROBADA_SIN_PLAZA'));
  return conRegistro(denegar('CLASE_YA_EMPEZADA'));
}

// ── Abrir la puerta tras un 🟢 ──────────────────────────────────────────────

/** Cuánto vale un 🟢 para abrir la puerta con él. Pasado esto, se vuelve a escanear. */
const VIGENCIA_PUERTA_MIN = 10;

/**
 * «Abrir la puerta»: solo con un escaneo 🟢 reciente de ESTE estudio (su fila
 * del historial es la prueba), con reserva confirmada o plaza fija — no con
 * «Ya había entrado» —, y solo para quien escanea en el panel. La instructora
 * no abre la puerta del estudio desde su app.
 */
export async function abrirPuertaTrasEscaneo(
  admin: Admin, actor: Actor, m: Marcadores,
  p: { escaneoId: number; ahora?: Date },
): Promise<{ puerta: 'abierta' | 'fallo' } | ErrorEscaneo> {
  if (actor.instructorId || !m.abrirPuerta) return { error: 'No puedes abrir la puerta desde aquí.', status: 403 };
  const { data: fila, error } = await admin.from('accesos_escaneos')
    .select('id, ocurrido_en, resultado, motivo')
    .eq('id', p.escaneoId).eq('studio_id', actor.studioId).maybeSingle();
  if (error) throw error;
  if (!fila) return { error: 'No encontramos ese escaneo.', status: 404 };
  if (fila.resultado !== 'PERMITIDO' || !(fila.motivo === 'RESERVA_CONFIRMADA' || fila.motivo === 'PLAZA_FIJA')) {
    return { error: 'Solo se abre la puerta a quien tiene el acceso permitido.', status: 409 };
  }
  if ((p.ahora ?? new Date()).getTime() - Date.parse(fila.ocurrido_en as string) > VIGENCIA_PUERTA_MIN * MIN) {
    return { error: 'Ha pasado demasiado rato. Vuelve a escanear su QR.', status: 409 };
  }
  return { puerta: await m.abrirPuerta() };
}

/** Las clases de ahora, para que recepción pueda fijar una. */
export async function clasesDeAhora(admin: Admin, actor: Actor, ahora: Date = new Date()): Promise<ClaseDetalle[]> {
  const deAhora = (await sesionesDeAhora(admin, actor, ahora.getTime())).filter(s => s.cancelada !== true);
  const detalles = await detallar(admin, actor.studioId, deAhora);
  return deAhora.map(s => detalles.get(s.id)!).filter(Boolean);
}

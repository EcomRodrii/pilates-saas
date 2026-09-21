// ─────────────────────────────────────────────────────────────────────────────
// Recordatorio de clase: UN dueño para todos sus canales.
//
// Antes eran dos programadores que no se conocían: Inngest (email + WhatsApp,
// diario a las 08:00 UTC, clases de las 24 h siguientes, CONFIRMADA y también
// ASISTIDA) y pg_cron (push 24 h y 1 h, cada 15 min, solo CONFIRMADA). Una socia
// podía recibir tres mensajes por la misma clase y a horas que no casaban.
//
// Decisión del fundador (final). Las antelaciones son las de por defecto: desde
// migr 20260921150000 cada estudio elige 12/24/48 h y 30/60/120 min.
//   · 24 h antes → aviso en su app + email + WhatsApp (si el estudio lo conectó).
//   · 1 h antes  → solo aviso en su app.
//   · Si reservó con la franja de 24 h ya pasada y aún falta más de 1 h 15 min,
//     la pasada siguiente le manda el email y el WhatsApp UNA vez (franja
//     `tardia`, mismos reclamos). El push de 24 h no se repite.
//   · Apagar la plantilla «Recordatorio de clase» calla SOLO el email.
//   · Nunca a una reserva que no esté CONFIRMADA (ASISTIDA incluida).
//
// Lo llama únicamente el barrido global de pg_cron (`notif-recordatorios`, cada
// 15 min) a través de `recordatorios-clase-cron.ts`. El camino viejo de Inngest
// ya está retirado, pero el email sigue reclamando su fila de
// `recordatorio_envios` antes de mandar, así que dos pasadas solapadas no lo
// repiten.
//
// Sin imports de `@/...` a propósito: así se prueba con `node --test` y el
// cliente REAL de supabase-js. Lo que necesita `@/` (Resend + plantillas, el
// motor de notificaciones, la paginación) entra por `PuertosRecordatorio`.
// ─────────────────────────────────────────────────────────────────────────────
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatosClaseEmail } from '../emails/send-server.ts';
import { EVENTOS } from '../notifications/catalog.ts';
import type { NotificationEvent } from '../notifications/types.ts';
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla, PLANTILLA_RECORDATORIO } from '../whatsapp.ts';
import { whatsappDelEstudio, type WhatsAppDelEstudio } from '../whatsapp-estudio.ts';
import { acumuladorSalud } from '../integraciones/salud.ts';
import { exigirLectura } from '../exigir-lectura.ts';
import { mapLimit } from '../concurrency.ts';
import { fechaLargaEstudio, horaEstudio } from '../utils.ts';
import {
  ANTELACION_POR_DEFECTO, antelacionDeFila, textoAntelacion, type AntelacionRecordatorio,
} from './antelacion-recordatorio.ts';

export {
  ANTELACION_POR_DEFECTO, ANTELACIONES_CORTO_MINUTOS, ANTELACIONES_LARGO_HORAS, antelacionDeFila, textoAntelacion,
  type AntelacionRecordatorio,
} from './antelacion-recordatorio.ts';
import type { TipoExcepcion } from '../excepciones.ts';

// Tipado, no un literal suelto: una errata aquí apagaría la exención en
// silencio y nadie se enteraría hasta que una socia exenta recibiera el aviso.
const EXENCION_RECORDATORIO: TipoExcepcion = 'SIN_RECORDATORIO';

// Envíos en paralelo dentro de una pasada. El barrido corre con maxDuration=60
// y cada email son ~0,5 s (tres lecturas de plantilla/marca + render + Resend):
// en serie, 120 alumnas en la franja de las 18:00 no caben. Y no más de 4:
// Resend corta a 10 peticiones/segundo (ver `lib/emails/resend-reintentos.ts`).
const CONCURRENCIA_ENVIOS = 4;

// ── Franjas ──────────────────────────────────────────────────────────────────

/**
 * `tardia` = quien reservó cuando la franja de 24 h ya había pasado. No es una
 * franja de push: solo recupera el email y el WhatsApp que no llegó a tener.
 */
//
// ⚠️ '24h' y '1h' son NOMBRES de franja, no su duración: son el recordatorio
// LARGO (push + email + WhatsApp) y el CORTO (solo push), y cada estudio decide
// su antelación (`studios.recordatorio_largo_horas` / `_corto_minutos`, migr
// 20260921150000). Se conservan porque son también el tipo de evento
// (`reserva.recordatorio_24h`/`_1h`) y la clave de dedup de los ya enviados.
export type FranjaRecordatorio = '24h' | '1h' | 'tardia';
type FranjaPush = Exclude<FranjaRecordatorio, 'tardia'>;

// Horas ABSOLUTAS hasta el inicio, no «misma hora local del día anterior»: la
// víspera del cambio de hora, 24 h antes de una clase de las 10:00 son las
// 11:00 (o las 09:00) en el reloj del estudio. El texto sí va en hora del
// estudio (`horaEstudio`, TZ_ESTUDIO). Anchura: el cron corre cada 15 min, así
// que la de 24 h (1 h) tiene cuatro pasadas y la de 1 h (30 min), dos.
//
// La anchura NO cambia con la antelación: depende del ritmo del cron, no de a
// cuánto está la clase. Con 30 min, la corta va de 15 a 45 min: dos pasadas.
export function franjasDe(a: AntelacionRecordatorio = ANTELACION_POR_DEFECTO): Record<FranjaPush, { centroH: number; margenH: number }> {
  return {
    '24h': { centroH: a.largoHoras, margenH: 0.5 },
    '1h': { centroH: a.cortoMinutos / 60, margenH: 0.25 },
  };
}
export const FRANJAS_RECORDATORIO = franjasDe();

const HORA_MS = 3_600_000;

// Franja tardía: ENTRE las dos de push, sin tocar ninguna — por defecto (1 h
// 15 min, 23 h 30 min). Por debajo solo queda el push corto: un correo que
// llegara minutos antes que ese push sería ruido, no un recordatorio.
export function franjaRecordatorio(
  inicio: string | Date, ahoraMs: number, a: AntelacionRecordatorio = ANTELACION_POR_DEFECTO,
): FranjaRecordatorio | null {
  const inicioMs = new Date(inicio).getTime();
  if (!Number.isFinite(inicioMs)) return null;
  for (const franja of ['24h', '1h'] as FranjaPush[]) {
    const { desdeMs, hastaMs } = limitesFranja(franja, ahoraMs, a);
    if (inicioMs >= desdeMs && inicioMs <= hastaMs) return franja;
  }
  if (inicioMs > limitesFranja('1h', ahoraMs, a).hastaMs && inicioMs < limitesFranja('24h', ahoraMs, a).desdeMs) return 'tardia';
  return null;
}

/** Inicios de clase que caen en la franja, ambos extremos incluidos. */
export function ventanaFranja(
  franja: FranjaPush, ahoraMs: number, a: AntelacionRecordatorio = ANTELACION_POR_DEFECTO,
): { desdeISO: string; hastaISO: string } {
  const { desdeMs, hastaMs } = limitesFranja(franja, ahoraMs, a);
  return { desdeISO: new Date(desdeMs).toISOString(), hastaISO: new Date(hastaMs).toISOString() };
}

/**
 * Lo que lee el barrido: del inicio de la franja corta MÁS CORTA al final de la
 * larga MÁS LARGA entre los estudios. Ceñida a lo que hay configurado: si nadie
 * pidió 48 h no se leen dos días de clases cada 15 min.
 */
export function ventanaBarrido(
  ahoraMs: number, antelaciones: AntelacionRecordatorio[] = [ANTELACION_POR_DEFECTO],
): { desdeISO: string; hastaISO: string } {
  const lista = antelaciones.length ? antelaciones : [ANTELACION_POR_DEFECTO];
  const desdeMs = Math.min(...lista.map((a) => limitesFranja('1h', ahoraMs, a).desdeMs));
  const hastaMs = Math.max(...lista.map((a) => limitesFranja('24h', ahoraMs, a).hastaMs));
  return { desdeISO: new Date(desdeMs).toISOString(), hastaISO: new Date(hastaMs).toISOString() };
}

function limitesFranja(franja: FranjaPush, ahoraMs: number, a: AntelacionRecordatorio = ANTELACION_POR_DEFECTO) {
  const { centroH, margenH } = franjasDe(a)[franja];
  return { desdeMs: ahoraMs + (centroH - margenH) * HORA_MS, hastaMs: ahoraMs + (centroH + margenH) * HORA_MS };
}

// ── Canales ──────────────────────────────────────────────────────────────────

export interface EntradaCanalesRecordatorio {
  franja: FranjaRecordatorio;
  estado: string;
  /** «No enviarle recordatorios» (socio_excepciones SIN_RECORDATORIO). */
  exenta: boolean;
  /** `notification_preference` categoría 'reservas'. Sin fila = quiere (lo de siempre). */
  preferencias: { email?: boolean | null; whatsapp?: boolean | null } | null | undefined;
  /** `plantillas_email.enviar` del estudio para 'recordatorio' (¡no `activa`!). */
  plantillaEmailEncendida: boolean;
  whatsappConectado: boolean;
  tieneEmail: boolean;
  tieneTelefono: boolean;
  /**
   * Solo cuenta en la franja tardía: canales con fila en `recordatorio_envios`.
   * En la de 24 h lo resuelve el propio INSERT del reclamo (cuatro pasadas); la
   * tardía dura hasta 22 h, y un INSERT por reserva cada 15 min sería absurdo.
   */
  yaReclamado?: { email?: boolean; whatsapp?: boolean } | null;
}

export interface CanalesRecordatorio { push: boolean; email: boolean; whatsapp: boolean }

const NINGUNO: CanalesRecordatorio = { push: false, email: false, whatsapp: false };

export function canalesRecordatorio(e: EntradaCanalesRecordatorio): CanalesRecordatorio {
  // ASISTIDA incluida: a quien ya ha pasado lista no se le recuerda la clase.
  if (e.estado !== 'CONFIRMADA' || e.exenta) return NINGUNO;
  // El aviso en su app sale siempre; sus preferencias de push las aplica el
  // motor de notificaciones, no esto.
  if (e.franja === '1h') return { push: true, email: false, whatsapp: false };
  // La plantilla apagada calla SOLO el correo: ni el push ni el WhatsApp.
  const email = e.plantillaEmailEncendida && (e.preferencias?.email ?? true) && e.tieneEmail;
  const whatsapp = e.whatsappConectado && (e.preferencias?.whatsapp ?? true) && e.tieneTelefono;
  if (e.franja === 'tardia') {
    // Reservó con la franja de 24 h ya pasada: recupera el email y el WhatsApp
    // UNA vez. El push no se repite: el suyo es el de 1 h.
    return { push: false, email: email && !e.yaReclamado?.email, whatsapp: whatsapp && !e.yaReclamado?.whatsapp };
  }
  return { push: true, email, whatsapp };
}

// ── Contenido ────────────────────────────────────────────────────────────────

export interface ClaseParaRecordar {
  inicioISO: string;
  nombre: string | null;
  sala: string | null;
  instructor: string | null;
  estudioNombre: string | null;
  zoomJoinUrl: string | null;
}

// Una sola función arma lo que viaja en el email para los DOS caminos: con la
// misma clave de idempotencia y un cuerpo distinto, Resend no deduplica, rechaza.
export function datosClaseRecordatorio(c: ClaseParaRecordar): DatosClaseEmail {
  const inicio = new Date(c.inicioISO);
  return {
    claseNombre: c.nombre ?? 'Clase',
    fecha: fechaLargaEstudio(inicio),
    hora: horaEstudio(inicio),
    sala: c.sala ?? '',
    instructor: c.instructor ?? '',
    estudioNombre: c.estudioNombre ?? 'Tentare',
    zoomJoinUrl: c.zoomJoinUrl ?? null,
  };
}

/** Estable por (sesión, socia): la misma que usaba el camino de Inngest. */
export function claveIdempotenciaRecordatorio(sesionId: string, socioId: string): string {
  return `recordatorio-${sesionId}-${socioId}`;
}

// ── Reclamo en recordatorio_envios ───────────────────────────────────────────
//
// PK (sesion_id, socio_id, canal), `canal` texto libre sin CHECK: 'EMAIL' cabe
// sin migración. Compare-and-set: se reclama ANTES de enviar; un 23505 es «ya
// lo mandó otra pasada (u otro camino)».

type CanalReclamado = 'EMAIL' | 'WHATSAPP';

async function reclamar(admin: SupabaseClient, sesionId: string, socioId: string, canal: CanalReclamado): Promise<boolean> {
  const { error } = await admin.from('recordatorio_envios').insert({ sesion_id: sesionId, socio_id: socioId, canal });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`reclamando recordatorio ${canal}: ${error.message}`);
}

async function soltar(admin: SupabaseClient, sesionId: string, socioId: string, canal: CanalReclamado): Promise<void> {
  const { error } = await admin.from('recordatorio_envios').delete()
    .eq('sesion_id', sesionId).eq('socio_id', socioId).eq('canal', canal);
  // Si no se puede soltar, ese email ya no se reintentará: se pierde un aviso,
  // pero nunca se duplica. Se deja rastro.
  if (error) console.error('[recordatorios] no se pudo soltar el reclamo', canal, error.message);
}

export type ResultadoEmail =
  | { ok: true; id?: string }
  | { ok: false; skipped: true }
  | { ok: false; error: string };

export interface EnvioEmailRecordatorio {
  tipo: 'recordatorio';
  to: string;
  toName: string;
  data: DatosClaseEmail;
  studioId: string;
  idempotencyKey: string;
}

/** En producción, `enviarEmailTransaccional` (Resend + plantilla + interruptor del estudio). */
export type EnviarEmail = (p: EnvioEmailRecordatorio) => Promise<ResultadoEmail>;

export type EstadoEmail = 'enviado' | 'ya-enviado' | 'fallido' | 'omitido';

/**
 * Reclama (sesión, socia, 'EMAIL'), manda y, si no salió, suelta el reclamo
 * para que la siguiente pasada dentro de la franja lo reintente. La usan los
 * dos caminos (este barrido y el de Inngest mientras dure la transición).
 */
export async function enviarEmailRecordatorio(
  admin: SupabaseClient,
  envio: { sesionId: string; socioId: string; studioId: string; to: string; toName: string; data: DatosClaseEmail },
  enviarEmail: EnviarEmail,
): Promise<EstadoEmail> {
  if (!(await reclamar(admin, envio.sesionId, envio.socioId, 'EMAIL'))) return 'ya-enviado';
  let res: ResultadoEmail;
  try {
    res = await enviarEmail({
      tipo: 'recordatorio', to: envio.to, toName: envio.toName, data: envio.data, studioId: envio.studioId,
      idempotencyKey: claveIdempotenciaRecordatorio(envio.sesionId, envio.socioId),
    });
  } catch (err) {
    await soltar(admin, envio.sesionId, envio.socioId, 'EMAIL');
    throw err;
  }
  if (res.ok) return 'enviado';
  // `skipped` (Resend sin configurar, o el estudio apagó el correo entre la
  // lectura y el envío) tampoco ha mandado nada: se suelta igual.
  await soltar(admin, envio.sesionId, envio.socioId, 'EMAIL');
  return 'skipped' in res ? 'omitido' : 'fallido';
}

export type ResultadoWhatsApp = { ok: true } | { ok: false; error: string };

/**
 * Reclama (sesión, socia, 'WHATSAPP') y manda. A diferencia del email, un fallo
 * NO suelta el reclamo (C-6, igual que antes): reintentar cada 15 min contra un
 * token caducado quemaría la reputación del número en Meta. `null` = ya salió.
 */
export async function enviarWhatsAppRecordatorio(
  admin: SupabaseClient,
  envio: { sesionId: string; socioId: string; telefono: string; data: DatosClaseEmail; whatsapp: WhatsAppDelEstudio },
): Promise<ResultadoWhatsApp | null> {
  if (!(await reclamar(admin, envio.sesionId, envio.socioId, 'WHATSAPP'))) return null;
  const d = envio.data;
  const estudio = d.estudioNombre ?? 'Tentare';
  const res = envio.whatsapp.plantillaRecordatorio
    ? await enviarWhatsAppPlantilla(envio.whatsapp, envio.telefono, PLANTILLA_RECORDATORIO, [
        estudio, d.claseNombre, d.fecha, d.hora, d.sala || 'tu estudio',
      ])
    : await enviarWhatsAppTexto(
        envio.whatsapp, envio.telefono,
        `Recordatorio · ${estudio}\nTienes ${d.claseNombre} el ${d.fecha} a las ${d.hora}${d.sala ? ` en ${d.sala}` : ''}.`,
      );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

// ── Dueño: una reserva, una franja ───────────────────────────────────────────

export interface ReservaParaRecordar {
  id: string;
  estado: string;
  sesionId: string;
  studioId: string;
  socioId: string;
  slug: string;
  clase: ClaseParaRecordar;
  /** `null` = no se pudo leer su ficha en esta pasada: solo push, el resto se reintenta. */
  socia: { nombre: string | null; email: string | null; telefono: string | null } | null;
  exenta: boolean;
  preferencias: { email?: boolean | null; whatsapp?: boolean | null } | null;
  plantillaEmailEncendida: boolean;
  whatsapp: WhatsAppDelEstudio | null;
  /** Ver `EntradaCanalesRecordatorio.yaReclamado` (solo franja tardía). */
  yaReclamado?: { email: boolean; whatsapp: boolean } | null;
  /** La de su estudio. Ausente = la de siempre (24 h y 1 h). */
  antelacion?: AntelacionRecordatorio;
}

export interface PuertosRecordatorio {
  /** `publish` del motor de notificaciones (in-app + push). */
  publicar: (evento: NotificationEvent) => Promise<unknown>;
  enviarEmail: EnviarEmail;
  /** `fetchAllRows`: PostgREST corta en 1.000 filas EN SILENCIO. */
  leerTodas: <T>(
    studioId: string,
    tabla: string,
    pagina: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ) => Promise<{ data: T[]; error: { message: string } | null }>;
  registrarSalud: (admin: SupabaseClient, studioId: string, tipo: string, resultado: ResultadoWhatsApp) => Promise<void>;
}

export interface ResultadoRecordatorio {
  canales: CanalesRecordatorio;
  push: boolean;
  email: EstadoEmail | 'no';
  whatsapp: ResultadoWhatsApp | 'ya-enviado' | 'no';
  /** Le tocaba email y su ficha no tiene dirección. */
  sinEmail: boolean;
}

export async function enviarRecordatorioClase(
  admin: SupabaseClient,
  reserva: ReservaParaRecordar,
  franja: FranjaRecordatorio,
  puertos: Pick<PuertosRecordatorio, 'publicar' | 'enviarEmail'>,
): Promise<ResultadoRecordatorio> {
  const socia = reserva.socia;
  const entrada: EntradaCanalesRecordatorio = {
    franja,
    estado: reserva.estado,
    exenta: reserva.exenta,
    preferencias: reserva.preferencias,
    plantillaEmailEncendida: reserva.plantillaEmailEncendida,
    whatsappConectado: !!reserva.whatsapp,
    tieneEmail: !!socia?.email,
    tieneTelefono: !!socia?.telefono,
    yaReclamado: reserva.yaReclamado,
  };
  const canales = canalesRecordatorio(entrada);
  const sinEmail = !!socia && !socia.email && canalesRecordatorio({ ...entrada, tieneEmail: true }).email;
  const resultado: ResultadoRecordatorio = { canales, push: false, email: 'no', whatsapp: 'no', sinEmail };

  if (canales.push) {
    await puertos.publicar({
      type: franja === '24h' ? EVENTOS.RECORDATORIO_24H : EVENTOS.RECORDATORIO_1H,
      studioId: reserva.studioId,
      data: {
        clase: reserva.clase.nombre ?? 'tu clase',
        hora: horaEstudio(reserva.clase.inicioISO),
        slug: reserva.slug,
        sesionId: reserva.sesionId,
        socioId: reserva.socioId,
        // `{antelacion}` del texto: «Tu clase es en 24 horas», o lo que eligió el estudio.
        antelacion: textoAntelacion(franja === '24h' ? '24h' : '1h', reserva.antelacion),
      },
      resource: { type: 'sesion', id: reserva.sesionId },
      // Misma clave que antes: el despliegue no repite pushes ya creados.
      dedupKey: `recordatorio-${franja}:${reserva.id}`,
    });
    resultado.push = true;
  }

  if (!socia || (!canales.email && !canales.whatsapp)) return resultado;
  const data = datosClaseRecordatorio(reserva.clase);

  if (canales.email && socia.email) {
    resultado.email = await enviarEmailRecordatorio(admin, {
      sesionId: reserva.sesionId, socioId: reserva.socioId, studioId: reserva.studioId,
      to: socia.email, toName: socia.nombre ?? 'Socia', data,
    }, puertos.enviarEmail);
  }

  if (canales.whatsapp && reserva.whatsapp && socia.telefono) {
    const res = await enviarWhatsAppRecordatorio(admin, {
      sesionId: reserva.sesionId, socioId: reserva.socioId, telefono: socia.telefono, data, whatsapp: reserva.whatsapp,
    });
    resultado.whatsapp = res ?? 'ya-enviado';
  }

  return resultado;
}

// ── Barrido global ───────────────────────────────────────────────────────────

export interface ResumenBarrido {
  publicados: number;
  emails: { enviados: number; yaEnviados: number; fallidos: number; omitidos: number; sinEmail: number };
  whatsapp: { enviados: number; fallidos: number };
  /** Lecturas no imprescindibles que fallaron: esa pasada no mandó email/WhatsApp (o salió sin sala/instructora). */
  lecturasDegradadas: string[];
}

type Fila = Record<string, unknown>;

export async function barrerRecordatoriosClase(
  admin: SupabaseClient,
  puertos: PuertosRecordatorio,
  ahoraMs: number = Date.now(),
): Promise<ResumenBarrido> {
  const resumen: ResumenBarrido = {
    publicados: 0,
    emails: { enviados: 0, yaEnviados: 0, fallidos: 0, omitidos: 0, sinEmail: 0 },
    whatsapp: { enviados: 0, fallidos: 0 },
    lecturasDegradadas: [],
  };
  const degradada = (que: string, error: { message: string }) => {
    console.error(`[recordatorios] ${que}`, error.message);
    resumen.lecturasDegradadas.push(que);
  };
  const uniq = (xs: unknown[]) => [...new Set(xs.filter((x): x is string => typeof x === 'string' && !!x))];
  const leer = <T extends Fila>(tabla: string, pagina: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) =>
    puertos.leerTodas<T>('(global)', tabla, pagina);

  // ⚠️ Todas las lecturas van PAGINADAS: una consulta global lee las filas de
  // TODOS los estudios, y PostgREST corta en 1.000 sin avisar (#684).
  const { data: studios, error: errStudios } = await leer<{
    id: string; slug: string | null; nombre: string | null;
    recordatorio_largo_horas: number | null; recordatorio_corto_minutos: number | null;
  }>(
    'studios', (from, to) => admin.from('studios')
      .select('id, slug, nombre, recordatorio_largo_horas, recordatorio_corto_minutos')
      .is('suspendido_en', null).range(from, to),
  );
  exigirLectura(errStudios, 'leyendo estudios');
  if (!studios.length) return resumen;
  const studioPorId = new Map(studios.map((s) => [s.id, s]));
  const studioIds = studios.map((s) => s.id);
  const antelacionPorStudio = new Map(studios.map((s) => [s.id, antelacionDeFila(s)]));
  const antelacionDe = (studioId: string) => antelacionPorStudio.get(studioId) ?? ANTELACION_POR_DEFECTO;

  // UNA lectura para las tres franjas, que son contiguas (de 45 min a 24 h 30
  // min): las clases del próximo día. `franjaRecordatorio` decide la de cada una.
  // `order('id')`: sin orden, dos páginas de PostgREST pueden repetir o saltarse filas.
  type Sesion = { id: string; studio_id: string; inicio: string; tipo_clase_id: string | null; sala_id: string | null; instructor_id: string | null; zoom_join_url: string | null };
  const { desdeISO, hastaISO } = ventanaBarrido(ahoraMs, [...antelacionPorStudio.values()]);
  const { data: sesionesVentana, error: errSesiones } = await leer<Sesion>('sesiones', (from, to) => admin.from('sesiones')
    .select('id, studio_id, inicio, tipo_clase_id, sala_id, instructor_id, zoom_join_url')
    .eq('cancelada', false).in('studio_id', studioIds)
    .gte('inicio', desdeISO).lte('inicio', hastaISO).order('id').range(from, to));
  exigirLectura(errSesiones, 'leyendo sesiones');
  const franjaDe = new Map<string, FranjaRecordatorio>();
  const sesPorId = new Map<string, Sesion>();
  for (const s of sesionesVentana) {
    const franja = franjaRecordatorio(s.inicio, ahoraMs, antelacionDe(s.studio_id));
    if (!franja) continue;
    franjaDe.set(s.id, franja);
    sesPorId.set(s.id, s);
  }
  if (!sesPorId.size) return resumen;
  const idsTardias = [...sesPorId.keys()].filter((id) => franjaDe.get(id) === 'tardia');

  type Reserva = { id: string; studio_id: string; socio_id: string | null; sesion_id: string; estado: string };
  const [tipos, reservasR, reclamosR] = await Promise.all([
    leer<{ id: string; nombre: string | null }>('tipos_clase', (from, to) => admin.from('tipos_clase')
      .select('id, nombre').in('id', uniq([...sesPorId.values()].map((s) => s.tipo_clase_id))).order('id').range(from, to)),
    // Solo CONFIRMADA: ASISTIDA ya pasó lista, y el resto no tiene plaza.
    leer<Reserva>('reservas', (from, to) => admin.from('reservas')
      .select('id, studio_id, socio_id, sesion_id, estado')
      .eq('estado', 'CONFIRMADA').in('sesion_id', [...sesPorId.keys()]).order('id').range(from, to)),
    // Franja tardía: qué canales ya salieron — en su franja de 24 h, por el
    // camino viejo de Inngest (reclamaba las mismas filas) o en otra pasada.
    idsTardias.length
      ? leer<{ sesion_id: string; socio_id: string; canal: string }>('recordatorio_envios', (from, to) => admin.from('recordatorio_envios')
          .select('sesion_id, socio_id, canal').in('sesion_id', idsTardias)
          .order('sesion_id').order('socio_id').order('canal').range(from, to))
      : { data: [], error: null },
  ]);
  exigirLectura(reservasR.error, 'leyendo reservas');
  // Decorativas: el nombre bonito de la clase, la sala, la instructora. Lanzar
  // dejaría sin aviso a TODAS por un fallo de adorno — y la franja de 1 h solo
  // tiene dos pasadas. Se sigue con lo que haya.
  if (tipos.error) degradada('tipos de clase', tipos.error);
  // Sin la lista de reclamos no se duplica nada: cada reserva tardía intenta su
  // reclamo y la PK de `recordatorio_envios` para a las que ya lo tenían.
  if (reclamosR.error) degradada('reclamos de recordatorio', reclamosR.error);
  const reclamados = new Set(reclamosR.data.map((c) => `${c.sesion_id}:${c.socio_id}:${c.canal}`));
  const yaReclamado = (r: Reserva) => ({
    email: reclamados.has(`${r.sesion_id}:${r.socio_id}:EMAIL`),
    whatsapp: reclamados.has(`${r.sesion_id}:${r.socio_id}:WHATSAPP`),
  });
  const esTardia = (r: Reserva) => franjaDe.get(r.sesion_id) === 'tardia';
  const conSocia = reservasR.data.filter((r) => r.socio_id && sesPorId.has(r.sesion_id));
  // Lo normal en la franja tardía es que ya tuviera su recordatorio de 24 h:
  // esas no pasan de aquí y no cuestan ninguna lectura más.
  const tardiasPendientes = conSocia.filter((r) => {
    if (!esTardia(r)) return false;
    const y = yaReclamado(r);
    return !y.email || !y.whatsapp;
  });
  const nombreTipo = new Map(tipos.data.map((t) => [t.id, t.nombre]));

  // Interruptores del estudio (WhatsApp conectado, correo del recordatorio
  // apagado), ANTES de leer fichas: una tardía solo sigue si le queda un canal
  // que su estudio usa. Sin esto, en un estudio sin WhatsApp cada reserva ya
  // avisada volvería a leer su ficha cada 15 min por un reclamo de WHATSAPP que
  // nunca va a tener.
  const whatsappPorStudio = new Map<string, WhatsAppDelEstudio>();
  const plantillaApagada = new Set<string>();
  const studiosContacto = uniq([...conSocia.filter((r) => franjaDe.get(r.sesion_id) === '24h'), ...tardiasPendientes].map((r) => r.studio_id));
  if (studiosContacto.length) {
    const [integracionesR, plantillasR] = await Promise.all([
      leer<{ studio_id: string; activo: boolean | null; config: Record<string, string> | null }>('integraciones', (from, to) => admin
        .from('integraciones').select('studio_id, activo, config').eq('tipo', 'WHATSAPP').in('studio_id', studiosContacto).order('studio_id').range(from, to)),
      // `enviar`, NO `activa`: `activa=false` solo descarta la personalización
      // (el correo sale con el texto de fábrica). Mismo criterio que
      // `envioDesactivado` en lib/emails/plantillas-server.ts.
      leer<{ studio_id: string }>('plantillas_email', (from, to) => admin.from('plantillas_email')
        .select('studio_id').eq('tipo', 'recordatorio').eq('enviar', false).in('studio_id', studiosContacto).order('studio_id').range(from, to)),
    ]);
    if (integracionesR.error) degradada('integraciones de WhatsApp', integracionesR.error);
    for (const row of integracionesR.data) {
      const creds = whatsappDelEstudio({ activo: !!row.activo, config: row.config });
      if (creds) whatsappPorStudio.set(row.studio_id, creds);
    }
    // Fail-OPEN, como `envioDesactivado`: sin poder leerla, el correo sale; y
    // `enviarEmailTransaccional` vuelve a mirar el interruptor antes de mandar.
    if (plantillasR.error) degradada('plantillas de email', plantillasR.error);
    for (const p of plantillasR.data) plantillaApagada.add(p.studio_id);
  }

  const reservas = conSocia.filter((r) => {
    if (!esTardia(r)) return true;
    const y = yaReclamado(r);
    return (!y.email && !plantillaApagada.has(r.studio_id)) || (!y.whatsapp && whatsappPorStudio.has(r.studio_id));
  });
  if (!reservas.length) return resumen;

  const socioIds = uniq(reservas.map((r) => r.socio_id));
  const { data: exentosR, error: errExentos } = await leer<{ socio_id: string }>('socio_excepciones', (from, to) => admin
    .from('socio_excepciones').select('socio_id').eq('tipo', EXENCION_RECORDATORIO).in('socio_id', socioIds).order('socio_id').range(from, to));
  // Si esta falla, se mandaría el aviso a quien pidió no recibirlo: no vale
  // seguir con la lista vacía.
  exigirLectura(errExentos, 'leyendo excepciones de recordatorio');
  const exentas = new Set(exentosR.map((e) => e.socio_id));

  // Lo que solo hace falta para email/WhatsApp (franjas de 24 h y tardía, no exentas).
  const reservasContacto = reservas.filter((r) => franjaDe.get(r.sesion_id) !== '1h' && !exentas.has(r.socio_id as string));
  const sesionesContacto = uniq(reservasContacto.map((r) => r.sesion_id)).map((id) => sesPorId.get(id) as Sesion);
  type Socia = { id: string; nombre: string | null; email: string | null; telefono: string | null; auth_user_id: string | null };
  const sociaPorId = new Map<string, Socia>();
  const prefsPorAuth = new Map<string, { email: boolean | null; whatsapp: boolean | null }>();
  const nombreSala = new Map<string, string | null>();
  const nombreInstructora = new Map<string, string | null>();
  // Sin ficha o sin preferencias leídas no se sabe a quién ni si quiere: esa
  // pasada no manda email/WhatsApp y no reclama nada, así que la siguiente
  // dentro de la franja lo intenta de nuevo. El push sale igual.
  let contactoLeido = true;
  if (reservasContacto.length) {
    const [sociosR, salas, instructores] = await Promise.all([
      leer<Socia>('socios', (from, to) => admin.from('socios')
        .select('id, nombre, email, telefono, auth_user_id').in('id', uniq(reservasContacto.map((r) => r.socio_id))).order('id').range(from, to)),
      leer<{ id: string; nombre: string | null }>('salas', (from, to) => admin.from('salas')
        .select('id, nombre').in('id', uniq(sesionesContacto.map((s) => s.sala_id))).order('id').range(from, to)),
      leer<{ id: string; nombre: string | null }>('instructores', (from, to) => admin.from('instructores')
        .select('id, nombre').in('id', uniq(sesionesContacto.map((s) => s.instructor_id))).order('id').range(from, to)),
    ]);
    if (sociosR.error) { degradada('socias', sociosR.error); contactoLeido = false; }
    for (const s of sociosR.data) sociaPorId.set(s.id, s);
    if (salas.error) degradada('salas', salas.error);
    for (const t of salas.data) nombreSala.set(t.id, t.nombre);
    if (instructores.error) degradada('instructores', instructores.error);
    for (const t of instructores.data) nombreInstructora.set(t.id, t.nombre);

    const authIds = uniq([...sociaPorId.values()].map((s) => s.auth_user_id));
    if (authIds.length) {
      // Categoría 'reservas', indexada por `auth_user_id` (la fila la crea el
      // JWT de la socia). Ver P-6 de la 23ª pasada.
      const prefsR = await leer<{ user_id: string; email: boolean | null; whatsapp: boolean | null }>('notification_preference', (from, to) => admin
        .from('notification_preference').select('user_id, email, whatsapp').eq('category', 'reservas').in('user_id', authIds).range(from, to));
      if (prefsR.error) { degradada('preferencias de notificación', prefsR.error); contactoLeido = false; }
      for (const p of prefsR.data) prefsPorAuth.set(p.user_id, { email: p.email, whatsapp: p.whatsapp });
    }
  }

  const saludPorStudio = new Map<string, ReturnType<typeof acumuladorSalud>>();
  const errores: string[] = [];

  await mapLimit(reservas, CONCURRENCIA_ENVIOS, async (r) => {
    const ses = sesPorId.get(r.sesion_id)!;
    const franja = franjaDe.get(r.sesion_id)!;
    const socioId = r.socio_id as string;
    const studio = studioPorId.get(ses.studio_id);
    const ficha = sociaPorId.get(socioId);
    const reserva: ReservaParaRecordar = {
      id: r.id, estado: r.estado, sesionId: ses.id, studioId: ses.studio_id, socioId,
      slug: studio?.slug ?? '',
      clase: {
        inicioISO: ses.inicio,
        nombre: ses.tipo_clase_id ? nombreTipo.get(ses.tipo_clase_id) ?? null : null,
        sala: ses.sala_id ? nombreSala.get(ses.sala_id) ?? null : null,
        instructor: ses.instructor_id ? nombreInstructora.get(ses.instructor_id) ?? null : null,
        estudioNombre: studio?.nombre ?? null,
        zoomJoinUrl: ses.zoom_join_url,
      },
      socia: contactoLeido && ficha ? { nombre: ficha.nombre, email: ficha.email, telefono: ficha.telefono } : null,
      exenta: exentas.has(socioId),
      preferencias: ficha?.auth_user_id ? prefsPorAuth.get(ficha.auth_user_id) ?? null : null,
      plantillaEmailEncendida: !plantillaApagada.has(ses.studio_id),
      whatsapp: whatsappPorStudio.get(ses.studio_id) ?? null,
      yaReclamado: franja === 'tardia' ? yaReclamado(r) : null,
      antelacion: antelacionDe(ses.studio_id),
    };
    try {
      const res = await enviarRecordatorioClase(admin, reserva, franja, puertos);
      if (res.push) resumen.publicados++;
      if (res.sinEmail) resumen.emails.sinEmail++;
      if (res.email === 'enviado') resumen.emails.enviados++;
      else if (res.email === 'ya-enviado') resumen.emails.yaEnviados++;
      else if (res.email === 'fallido') resumen.emails.fallidos++;
      else if (res.email === 'omitido') resumen.emails.omitidos++;
      if (typeof res.whatsapp === 'object') {
        let acc = saludPorStudio.get(ses.studio_id);
        if (!acc) { acc = acumuladorSalud(); saludPorStudio.set(ses.studio_id, acc); }
        acc.anota(res.whatsapp);
        if (res.whatsapp.ok) resumen.whatsapp.enviados++;
        else resumen.whatsapp.fallidos++;
      }
    } catch (err) {
      // Un reclamo que no se pudo escribir no para a las demás: se sigue y se
      // lanza al final, con el trabajo hecho y la salud anotada.
      errores.push(err instanceof Error ? err.message : String(err));
    }
  });

  // UNA escritura de salud por estudio y pasada, no una por mensaje; y solo si
  // se intentó algo (si no, se borraría la noticia que sí valía).
  for (const [studioId, acc] of saludPorStudio) {
    const resultado = acc.resultado();
    if (resultado) await puertos.registrarSalud(admin, studioId, 'WHATSAPP', resultado);
  }

  if (errores.length) {
    throw new Error(`[recordatorios] ${errores.length} recordatorio(s) sin poder reclamar: ${errores[0]}`);
  }
  return resumen;
}

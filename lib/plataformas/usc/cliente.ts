// Cliente de la API de Urban Sports Club (horario: eventos, trainers, plazas).
//
// Credenciales de Tentare como integrador, no de cada estudio: un solo
// `USC_CLIENT_ID`/`USC_CLIENT_SECRET` (el mismo secreto que firma el Instant
// Booking) y, por estudio, su `providerId` y `locationId` en
// `integraciones.config`. Sin credenciales, `credencialesUsc()` es null y nadie
// llama a nada: el cron se queda en no-op.
//
// Token: POST /auth con client_credentials en form-urlencoded (no JSON), vive
// 600 s. Se guarda en memoria del proceso y se pide otro un minuto antes.
import 'server-only';
import type { CuerpoEventoUsc } from './horario.ts';

const URL_POR_DEFECTO = 'https://connect.urbansportsclub.io';
const TIMEOUT_MS = 10_000;

export interface CredencialesUsc { base: string; clientId: string; secreto: string }

export function credencialesUsc(): CredencialesUsc | null {
  const clientId = process.env.USC_CLIENT_ID?.trim();
  const secreto = process.env.USC_CLIENT_SECRET?.trim();
  if (!clientId || !secreto) return null;
  return { base: (process.env.USC_API_URL?.trim() || URL_POR_DEFECTO).replace(/\/$/, ''), clientId, secreto };
}

let tokenEnMemoria: { valor: string; caduca: number; clientId: string } | null = null;

async function token(c: CredencialesUsc): Promise<string> {
  if (tokenEnMemoria && tokenEnMemoria.clientId === c.clientId && tokenEnMemoria.caduca > Date.now()) return tokenEnMemoria.valor;
  const res = await fetch(`${c.base}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secreto, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`USC /auth respondió ${res.status}`);
  const j = await res.json() as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('USC /auth sin access_token');
  const vida = Math.max(60, (j.expires_in ?? 600) - 60) * 1000;
  tokenEnMemoria = { valor: j.access_token, caduca: Date.now() + vida, clientId: c.clientId };
  return j.access_token;
}

export type RespuestaUsc = { ok: true; status: number; json: unknown } | { ok: false; status: number; json: unknown; clave: string | null };

/** La clave de negocio de un 409 (`fes.eventAlreadyCreated`…), si la hay. */
export function claveErrorUsc(json: unknown): string | null {
  const e = (json as { errors?: { key?: unknown } } | null)?.errors;
  return typeof e?.key === 'string' ? e.key : null;
}

/** Valor con nombre dentro de un error de negocio (p. ej. `event_id`). */
export function valorErrorUsc(json: unknown, clave: string): string | null {
  const valores = (json as { errors?: { values?: { key?: unknown; value?: unknown }[] } } | null)?.errors?.values;
  const v = valores?.find(x => x.key === clave)?.value;
  return typeof v === 'string' ? v : null;
}

async function llamar(c: CredencialesUsc, metodo: string, ruta: string, cuerpo?: unknown, extra?: Record<string, string>): Promise<RespuestaUsc> {
  const t = await token(c);
  const res = await fetch(`${c.base}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...extra },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) tokenEnMemoria = null;
  const json = await res.json().catch(() => null);
  return res.ok ? { ok: true, status: res.status, json } : { ok: false, status: res.status, json, clave: claveErrorUsc(json) };
}

const q = (providerId: string) => `providerId=${encodeURIComponent(providerId)}`;

export type ResultadoUsc<T> = { ok: true; valor: T } | { ok: false; error: string };

function fallo(r: Extract<RespuestaUsc, { ok: false }>): { ok: false; error: string } {
  return { ok: false, error: `USC ${r.status}${r.clave ? ` ${r.clave}` : ''}` };
}

/**
 * Crea el evento. Con `Idempotency-Key`: si ya se creó (respuesta perdida en
 * la pasada anterior), USC devuelve 200 con el evento, o un 409
 * `fes.eventAlreadyCreated` con su id — en los dos casos se adopta ese id en
 * vez de crear otro.
 */
export async function crearEventoUsc(c: CredencialesUsc, cuerpo: CuerpoEventoUsc, clave: string): Promise<ResultadoUsc<string>> {
  const r = await llamar(c, 'POST', '/events', cuerpo, { 'Idempotency-Key': clave });
  if (r.ok) {
    const id = (r.json as { eventId?: unknown } | null)?.eventId;
    return typeof id === 'string' ? { ok: true, valor: id.toLowerCase() } : { ok: false, error: 'USC: respuesta sin eventId' };
  }
  if (r.clave === 'fes.eventAlreadyCreated') {
    const id = valorErrorUsc(r.json, 'event_id');
    if (id) return { ok: true, valor: id.toLowerCase() };
  }
  return fallo(r);
}

export async function editarEventoUsc(c: CredencialesUsc, providerId: string, eventoId: string, cambios: Partial<CuerpoEventoUsc>): Promise<ResultadoUsc<null>> {
  const r = await llamar(c, 'PATCH', `/events/${encodeURIComponent(eventoId)}?${q(providerId)}`, cambios);
  return r.ok ? { ok: true, valor: null } : fallo(r);
}

/** Irreversible allí, y cancela también sus reservas. Ya cancelado = hecho. */
export async function cancelarEventoUsc(c: CredencialesUsc, providerId: string, eventoId: string): Promise<ResultadoUsc<null>> {
  const r = await llamar(c, 'PATCH', `/events/${encodeURIComponent(eventoId)}?${q(providerId)}`, { cancelled: true });
  if (r.ok || r.clave === 'fes.CannotUpdate' || r.clave === 'fes.CannotUncancel' || r.status === 404) return { ok: true, valor: null };
  return fallo(r);
}

/** Plazas que ocupa gente que NO viene de USC (ver `bookingCountUsc`). */
export async function enviarOcupacionUsc(c: CredencialesUsc, providerId: string, eventoId: string, bookingCount: number): Promise<ResultadoUsc<null>> {
  const r = await llamar(c, 'POST', '/bookingsetup', { providerId, eventId: eventoId, bookingCount });
  return r.ok ? { ok: true, valor: null } : fallo(r);
}

export async function crearTrainerUsc(c: CredencialesUsc, providerId: string, nombre: { firstName: string; lastName?: string }): Promise<ResultadoUsc<string>> {
  const r = await llamar(c, 'POST', '/trainers', { providerId, ...nombre });
  if (!r.ok) return fallo(r);
  const id = (r.json as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? { ok: true, valor: id.toLowerCase() } : { ok: false, error: 'USC: trainer sin id' };
}

/** Reescribe el nombre de un trainer (PUT: sin apellidos, se quedan a null). */
export async function renombrarTrainerUsc(c: CredencialesUsc, providerId: string, trainerId: string, nombre: { firstName: string; lastName?: string }): Promise<ResultadoUsc<null>> {
  const r = await llamar(c, 'PUT', `/trainers/${encodeURIComponent(trainerId)}?${q(providerId)}`, nombre);
  return r.ok ? { ok: true, valor: null } : fallo(r);
}

/**
 * Desde cuándo deja USC crear eventos de este proveedor. `null` = sin fecha
 * (activa ya). 404 = la integración no existe para ese proveedor: no se publica.
 */
export async function fechaAltaUsc(c: CredencialesUsc, providerId: string): Promise<ResultadoUsc<number | null>> {
  const r = await llamar(c, 'GET', `/events/go-live-date?${q(providerId)}`);
  if (!r.ok) return fallo(r);
  const v = (r.json as { goLiveDate?: unknown } | null)?.goLiveDate;
  if (typeof v !== 'string') return { ok: true, valor: null };
  // Sin zona: USC la da como fecha local; medianoche UTC es margen de sobra.
  const t = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
  return { ok: true, valor: Number.isFinite(t) && t > Date.UTC(2000, 0, 1) ? t : null };
}

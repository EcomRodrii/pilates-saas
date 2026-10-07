// Cliente de la API de Wellhub (Booking y Access Control).
//
// Credenciales de Tentare como integrador, no de cada estudio: un solo token
// Bearer sirve para sus APIs (developers.wellhub.com › Getting started) y, por
// estudio, su gym y su producto en `plataforma_conexiones`. Sin credenciales,
// `credencialesWellhub()` es null y nadie llama a nada.
//
// `WELLHUB_API_URL` es solo el HOST (producción por defecto; el sandbox es
// https://apitesting.partners.gympass.com) y las rutas llevan su `/booking/v1…`,
// `/access/v1…` o `/setup/v1…`. La Integration Setup API (alta automática de
// gyms y webhooks) queda fuera hasta probarla: sin sandbox documentado.
//
// Contrato, con sus contradicciones marcadas: docs/integraciones/wellhub.md.
import 'server-only';
import {
  desenlaceWellhub, leerValidacionWellhub, type CuerpoRespuestaReservaWellhub, type ResultadoValidacionWellhub,
} from '../wellhub-eventos.ts';
import type { CuerpoClaseWellhub, CuerpoSlotWellhub } from './horario.ts';

const API_POR_DEFECTO = 'https://api.partners.gympass.com';
const TIMEOUT_MS = 10_000;

export interface CredencialesWellhub {
  api: string;
  token: string;
  /** El secreto de los webhooks y, si se está rotando, el anterior. */
  secretosWebhook: string[];
  /** `system_id` de Tentare en Wellhub, si lo dan (opcional al crear clases). */
  systemId: number | null;
}

const sinBarra = (u: string) => u.replace(/\/+$/, '');

export function credencialesWellhub(): CredencialesWellhub | null {
  const token = process.env.WELLHUB_API_TOKEN?.trim();
  const secretosWebhook = [process.env.WELLHUB_WEBHOOK_SECRET, process.env.WELLHUB_WEBHOOK_SECRET_ANTERIOR]
    .map(s => s?.trim() ?? '').filter(Boolean);
  if (!token || secretosWebhook.length === 0) return null;
  const sistema = Number(process.env.WELLHUB_SYSTEM_ID);
  return {
    api: sinBarra(process.env.WELLHUB_API_URL?.trim() || API_POR_DEFECTO),
    token,
    secretosWebhook,
    systemId: Number.isSafeInteger(sistema) && sistema > 0 ? sistema : null,
  };
}

export type RespuestaWellhub = { ok: boolean; status: number; json: unknown };
export type ResultadoWellhub<T> = { ok: true; valor: T } | { ok: false; error: string; status: number };

async function llamar(c: CredencialesWellhub, metodo: string, url: string, cuerpo?: unknown, cabeceras?: Record<string, string>): Promise<RespuestaWellhub> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${c.token}`,
        Accept: 'application/json',
        ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...cabeceras,
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await res.text().catch(() => '');
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    // Sin respuesta (timeout, red): no se sabe qué hizo Wellhub.
    return { ok: false, status: 0, json: e instanceof Error ? e.message : null };
  }
}

/** La clave del primer error que devuelve Wellhub (`checkin.already.validated`…), si la hay. */
function claveError(r: RespuestaWellhub): string | null {
  const clave = (r.json as { errors?: { key?: unknown }[] } | null)?.errors?.[0]?.key;
  return typeof clave === 'string' ? clave.slice(0, 100) : null;
}

function fallo<T>(r: RespuestaWellhub, que: string): ResultadoWellhub<T> {
  const clave = claveError(r);
  return { ok: false, status: r.status, error: `Wellhub ${que}: ${r.status || 'sin respuesta'}${clave ? ` ${clave}` : ''}` };
}

const gym = (gymId: string) => encodeURIComponent(gymId);
const idDe = (v: unknown): string | null => (typeof v === 'number' || typeof v === 'string') && String(v) !== '' ? String(v) : null;

// ── Productos (para elegir uno al conectar) ─────────────────────────────────

export interface ProductoWellhub { id: number; nombre: string; virtual: boolean }

export async function productosWellhub(c: CredencialesWellhub, gymId: string): Promise<ResultadoWellhub<ProductoWellhub[]>> {
  const r = await llamar(c, 'GET', `${c.api}/setup/v1/gyms/${gym(gymId)}/products`);
  if (!r.ok) return fallo(r, 'productos');
  const lista = (r.json as { products?: unknown[] } | null)?.products ?? [];
  return {
    ok: true,
    valor: lista.flatMap(p => {
      const o = p as { product_id?: unknown; name?: unknown; virtual?: unknown };
      const id = Number(o.product_id);
      return Number.isSafeInteger(id) && id > 0
        ? [{ id, nombre: typeof o.name === 'string' ? o.name : `Producto ${id}`, virtual: o.virtual === true }]
        : [];
    }),
  };
}

// ── Clases ──────────────────────────────────────────────────────────────────

/**
 * Crea la clase. Sus clases no tienen clave de idempotencia: si una respuesta se
 * perdió en la pasada anterior, antes de crear otra se busca por `reference`
 * (el id del tipo de clase de Tentare) y se adopta.
 */
export async function crearClaseWellhub(c: CredencialesWellhub, gymId: string, cuerpo: CuerpoClaseWellhub): Promise<ResultadoWellhub<string>> {
  const existente = await claseWellhubPorReferencia(c, gymId, cuerpo.reference);
  if (existente.ok && existente.valor) return { ok: true, valor: existente.valor };
  const r = await llamar(c, 'POST', `${c.api}/booking/v1/gyms/${gym(gymId)}/classes`, {
    classes: [{ ...cuerpo, ...(c.systemId ? { system_id: c.systemId } : {}) }],
  });
  if (!r.ok) return fallo(r, 'crear clase');
  const id = idDe((r.json as { classes?: { id?: unknown }[] } | null)?.classes?.[0]?.id);
  return id ? { ok: true, valor: id } : { ok: false, status: r.status, error: 'Wellhub crear clase: respuesta sin id' };
}

async function claseWellhubPorReferencia(c: CredencialesWellhub, gymId: string, referencia: string): Promise<ResultadoWellhub<string | null>> {
  const r = await llamar(c, 'GET', `${c.api}/booking/v1/gyms/${gym(gymId)}/classes`);
  if (!r.ok) return fallo(r, 'listar clases');
  const lista = (r.json as { classes?: { id?: unknown; reference?: unknown }[] } | null)?.classes ?? [];
  return { ok: true, valor: idDe(lista.find(x => x.reference === referencia)?.id) };
}

export async function editarClaseWellhub(c: CredencialesWellhub, gymId: string, claseId: string, cuerpo: CuerpoClaseWellhub): Promise<ResultadoWellhub<null>> {
  const r = await llamar(c, 'PUT', `${c.api}/booking/v1/gyms/${gym(gymId)}/classes/${encodeURIComponent(claseId)}`, cuerpo);
  return r.ok ? { ok: true, valor: null } : fallo(r, 'editar clase');
}

/** Una clase no se borra en Wellhub: se oculta (con ella, sus slots). Ya inexistente = hecho. */
export async function ocultarClaseWellhub(c: CredencialesWellhub, gymId: string, claseId: string): Promise<ResultadoWellhub<null>> {
  const ruta = `${c.api}/booking/v1/gyms/${gym(gymId)}/classes/${encodeURIComponent(claseId)}`;
  const actual = await llamar(c, 'GET', ruta);
  if (actual.status === 404) return { ok: true, valor: null };
  if (!actual.ok) return fallo(actual, 'leer clase');
  const a = (actual.json ?? {}) as Record<string, unknown>;
  const r = await llamar(c, 'PUT', ruta, {
    name: a.name, description: a.description, notes: a.notes, bookable: a.bookable === true,
    visible: false, product_id: a.product_id, reference: a.reference,
  });
  return r.ok ? { ok: true, valor: null } : fallo(r, 'ocultar clase');
}

// ── Slots ───────────────────────────────────────────────────────────────────

const rutaSlots = (c: CredencialesWellhub, gymId: string, claseId: string) =>
  `${c.api}/booking/v1/gyms/${gym(gymId)}/classes/${encodeURIComponent(claseId)}/slots`;

/**
 * Crea el slot. Es único por clase + hora + sala: si ya existe (respuesta
 * perdida en la pasada anterior), Wellhub contesta 409 y se adopta el que hay.
 */
export async function crearSlotWellhub(c: CredencialesWellhub, gymId: string, claseId: string, cuerpo: CuerpoSlotWellhub): Promise<ResultadoWellhub<string>> {
  const r = await llamar(c, 'POST', rutaSlots(c, gymId, claseId), cuerpo);
  if (r.ok) {
    const id = idDe((r.json as { results?: { id?: unknown }[] } | null)?.results?.[0]?.id);
    return id ? { ok: true, valor: id } : { ok: false, status: r.status, error: 'Wellhub crear slot: respuesta sin id' };
  }
  if (r.status === 409) {
    const dia = cuerpo.occur_date.slice(0, 10);
    const offset = cuerpo.occur_date.slice(19);
    const q = `from=${encodeURIComponent(`${dia}T00:00:00${offset}`)}&to=${encodeURIComponent(`${dia}T23:59:59${offset}`)}`;
    const lista = await llamar(c, 'GET', `${rutaSlots(c, gymId, claseId)}?${q}`);
    const encontrado = ((lista.json as { results?: { id?: unknown; occur_date?: unknown; room?: unknown }[] } | null)?.results ?? [])
      .find(x => typeof x.occur_date === 'string' && Date.parse(x.occur_date.replace(/\[.*\]$/, '')) === Date.parse(cuerpo.occur_date)
        && (x.room ?? null) === (cuerpo.room ?? null));
    const id = idDe(encontrado?.id);
    if (id) return { ok: true, valor: id };
  }
  return fallo(r, 'crear slot');
}

export async function editarSlotWellhub(c: CredencialesWellhub, gymId: string, claseId: string, slotId: string, cuerpo: CuerpoSlotWellhub): Promise<ResultadoWellhub<null>> {
  const r = await llamar(c, 'PUT', `${rutaSlots(c, gymId, claseId)}/${encodeURIComponent(slotId)}`, cuerpo);
  return r.ok ? { ok: true, valor: null } : fallo(r, 'editar slot');
}

export async function aforoSlotWellhub(c: CredencialesWellhub, gymId: string, claseId: string, slotId: string, plazas: { total_capacity: number; total_booked: number }): Promise<ResultadoWellhub<null>> {
  const r = await llamar(c, 'PATCH', `${rutaSlots(c, gymId, claseId)}/${encodeURIComponent(slotId)}`, plazas);
  return r.ok ? { ok: true, valor: null } : fallo(r, 'aforo del slot');
}

/** Para siempre, y cancela allí sus reservas. Ya borrado = hecho. */
export async function borrarSlotWellhub(c: CredencialesWellhub, gymId: string, claseId: string, slotId: string): Promise<ResultadoWellhub<null>> {
  const r = await llamar(c, 'DELETE', `${rutaSlots(c, gymId, claseId)}/${encodeURIComponent(slotId)}`);
  return r.ok || r.status === 404 ? { ok: true, valor: null } : fallo(r, 'borrar slot');
}

// ── Reservas y check-ins ────────────────────────────────────────────────────

/**
 * Acepta, rechaza o anula una reserva (v2, la vigente). Aceptarla o rechazarla,
 * en menos de 15 min. Quien llama decide con la respuesta (`desenlaceWellhub`,
 * `trasConfirmarWellhub`), nunca con el reloj: «sin saber» se vuelve a intentar.
 * La `clave` del error va a Sentry: su doc no dice qué contesta a un PATCH
 * repetido, y así se sabrá.
 */
export async function responderReservaWellhub(
  c: CredencialesWellhub, gymId: string, bookingNumber: string, cuerpo: CuerpoRespuestaReservaWellhub,
): Promise<{ desenlace: 'hecho' | 'definitivo' | 'sin-saber'; status: number; clave: string | null }> {
  const r = await llamar(c, 'PATCH', `${c.api}/booking/v2/gyms/${gym(gymId)}/bookings/${encodeURIComponent(bookingNumber)}`, cuerpo);
  return { desenlace: desenlaceWellhub(r.status), status: r.status, clave: claveError(r) };
}

/** Valida el check-in de una socia: es lo que hace que Wellhub pague la visita. */
export async function validarCheckinWellhub(c: CredencialesWellhub, gymId: string, wellhubId: string): Promise<ResultadoValidacionWellhub> {
  const r = await llamar(c, 'POST', `${c.api}/access/v1/validate`, { gympass_id: wellhubId }, { 'X-Gym-Id': gymId });
  return r.status === 0 ? 'error' : leerValidacionWellhub(r.status, r.json);
}

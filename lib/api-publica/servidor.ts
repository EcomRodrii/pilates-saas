import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { clientIp, retryAfterSeconds } from '@/lib/rate-limit-core';
import { sha256Hex } from '@/lib/oauth-crypto';
import { suscripcionActiva, type Plan } from '@/lib/billing/entitlements';
import type { Rol } from '@/lib/types';
import type { ScopeOAuth } from './catalogo-scopes';
import { esClaveApi, hashClaveApi } from './claves';
import { scopesEfectivos } from './scopes';
import {
  CABECERA_IDEMPOTENCIA, credencialDeIdempotencia, decidirConClaveUsada, huellaPeticion, leerClaveIdempotencia, seGuarda,
  type FilaIdempotencia,
} from './idempotencia';

// ─────────────────────────────────────────────────────────────────────────────
// La puerta de la API pública v1 (/api/v1/*, y su alias /api/oauth/v1/*).
//
// Dos credenciales, un solo contexto:
//   · token OAuth de una app (Zapier), emitido por /api/oauth/token;
//   · clave de API del estudio (`tnt_sk_…`), creada en el panel.
// Las dos acaban en `ContextoApi` y a partir de ahí no se distinguen: mismos
// scopes, mismo límite de peticiones, misma auditoría (docs/api-publica.md).
//
// ⚠️ Corre con service-role, así que la RLS NO está debajo: el aislamiento
// entre estudios es `ctx.studioId`, que solo sale de la credencial, y TODA
// consulta de un endpoint lo filtra a mano. `lib/api-publica/rutas.test.ts`
// lo comprueba en cada fichero de app/api/v1.
// ─────────────────────────────────────────────────────────────────────────────

export type CredencialApi =
  | { tipo: 'oauth'; tokenId: string; clienteId: string }
  | { tipo: 'clave'; claveId: string };

export interface ContextoApi {
  studioId: string;
  credencial: CredencialApi;
  /** Lo que vale EN ESTA PETICIÓN: credencial ∩ rol actual de quien la concedió ∩ plan. */
  scopes: ScopeOAuth[];
  /** Quién la concedió (auth uid) y con qué rol está HOY en el estudio. */
  concedidaPor: string;
  rolDeQuienConcedio: Rol;
  requestId: string;
}

export interface ResultadoApi { status: number; body: unknown; headers?: Record<string, string> }

/** Códigos de error estables (los mismos que ya veía Zapier) + un mensaje legible. */
export type CodigoError =
  | 'invalid_token' | 'insufficient_scope' | 'invalid_request' | 'not_found'
  | 'rate_limited' | 'api_no_activada' | 'estudio_sin_acceso' | 'server_error'
  | 'idempotency_conflict' | 'request_in_progress';

export function error(status: number, codigo: CodigoError, mensaje: string, requestId?: string): ResultadoApi {
  return { status, body: { error: codigo, mensaje, ...(requestId ? { requestId } : {}) } };
}

/** Rol que `authUserId` tiene HOY en el estudio, o null si ya no tiene ninguno. */
async function rolActual(admin: SupabaseClient, studioId: string, authUserId: string, ownerAuthUserId: string | null): Promise<Rol | null> {
  if (ownerAuthUserId && authUserId === ownerAuthUserId) return 'PROPIETARIO';
  const { data } = await admin
    .from('instructores').select('rol')
    .eq('studio_id', studioId).eq('auth_user_id', authUserId).eq('activo', true)
    .maybeSingle();
  return (data?.rol as Rol | undefined) ?? null;
}

/** ¿Tiene el estudio la API activada? (Se activa estudio a estudio desde /interno.) */
export async function apiActivada(admin: SupabaseClient, studioId: string): Promise<boolean> {
  const { data: acceso } = await admin
    .from('api_acceso_estudios').select('desactivada_en').eq('studio_id', studioId).maybeSingle();
  return !!acceso && !acceso.desactivada_en;
}

export type AccesoVigente =
  | { ok: true; rol: Rol; plan: Plan }
  | { ok: false; motivo: 'estudio_sin_acceso' | 'sin_rol' };

/**
 * Lo que una credencial (o un webhook) necesita HOY para seguir valiendo: el
 * estudio con acceso a Tentare y quien la concedió todavía en él. La misma
 * regla para la API y para los webhooks.
 */
export async function accesoVigente(admin: SupabaseClient, studioId: string, concedidaPor: string): Promise<AccesoVigente> {
  const { data: studio } = await admin
    .from('studios').select('plan, subscription_status, suspendido_en, owner_auth_user_id')
    .eq('id', studioId).maybeSingle();
  if (!studio || studio.suspendido_en || !suscripcionActiva(studio.subscription_status)) {
    return { ok: false, motivo: 'estudio_sin_acceso' };
  }
  const rol = await rolActual(admin, studioId, concedidaPor, studio.owner_auth_user_id ?? null);
  if (!rol) return { ok: false, motivo: 'sin_rol' };
  const plan: Plan = studio.plan === 'ESTUDIO' || studio.plan === 'CADENA' ? studio.plan : 'BASE';
  return { ok: true, rol, plan };
}

type Autenticacion =
  | { ok: true; ctx: ContextoApi }
  | { ok: false; resultado: ResultadoApi; studioId?: string; credencial?: CredencialApi };

export async function autenticarApiPublica(req: NextRequest, admin: SupabaseClient, requestId: string): Promise<Autenticacion> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, resultado: error(401, 'invalid_token', 'Falta la cabecera Authorization: Bearer <credencial>.', requestId) };

  let studioId: string;
  let credencial: CredencialApi;
  let scopesCredencial: string[];
  let concedidaPor: string;
  /** Solo con un token OAuth: lo que su app puede pedir HOY. */
  let scopesDeLaApp: string[] | undefined;

  if (esClaveApi(token)) {
    const { data: clave } = await admin
      .from('api_claves')
      .select('id, studio_id, scopes, creada_por, expira_en, revocada_en')
      .eq('hash', hashClaveApi(token))
      .maybeSingle();
    if (!clave || clave.revocada_en || (clave.expira_en && Date.parse(clave.expira_en) <= Date.now())) {
      return { ok: false, resultado: error(401, 'invalid_token', 'La clave no existe, está revocada o ha caducado.', requestId) };
    }
    studioId = clave.studio_id;
    credencial = { tipo: 'clave', claveId: clave.id };
    scopesCredencial = clave.scopes ?? [];
    concedidaPor = clave.creada_por;

    // La API se activa estudio a estudio (decisión del fundador, 1-oct-2026).
    if (!(await apiActivada(admin, studioId))) {
      return { ok: false, studioId, credencial, resultado: error(403, 'api_no_activada', 'La API no está activada para este estudio.', requestId) };
    }
  } else {
    const { data: fila } = await admin
      .from('oauth_tokens')
      .select('id, studio_id, cliente_id, auth_user_id, scopes, revocado_en, access_token_expira_en')
      .eq('access_token_hash', sha256Hex(token))
      .maybeSingle();
    if (!fila || fila.revocado_en || Date.parse(fila.access_token_expira_en) < Date.now()) {
      return { ok: false, resultado: error(401, 'invalid_token', 'El token no existe, está revocado o ha caducado.', requestId) };
    }
    studioId = fila.studio_id;
    credencial = { tipo: 'oauth', tokenId: fila.id, clienteId: fila.cliente_id };
    scopesCredencial = fila.scopes ?? [];
    concedidaPor = fila.auth_user_id;

    // Una app que Tentare da de baja deja de entrar al momento, no cuando
    // caduque su token (1 h).
    const { data: app } = await admin.from('oauth_clientes').select('activo, scopes_permitidos').eq('id', fila.cliente_id).maybeSingle();
    if (!app?.activo) {
      return { ok: false, studioId, credencial, resultado: error(401, 'invalid_token', 'Esta aplicación ya no está autorizada.', requestId) };
    }
    // Recortar la lista de una app vale al momento, también para sus tokens vivos.
    scopesDeLaApp = (app.scopes_permitidos as string[] | null) ?? [];
  }

  const acceso = await accesoVigente(admin, studioId, concedidaPor);
  if (!acceso.ok && acceso.motivo === 'estudio_sin_acceso') {
    return { ok: false, studioId, credencial, resultado: error(403, 'estudio_sin_acceso', 'El estudio no tiene acceso a Tentare ahora mismo.', requestId) };
  }
  if (!acceso.ok) {
    // Quien la concedió ya no está en el estudio: la credencial muere con su acceso.
    return { ok: false, studioId, credencial, resultado: error(401, 'invalid_token', 'Quien concedió este acceso ya no forma parte del estudio.', requestId) };
  }
  const { rol, plan } = acceso;
  const scopes = scopesEfectivos({ credencial: scopesCredencial, rolDeQuienConcedio: rol, plan, app: scopesDeLaApp });
  if (scopes.length === 0) {
    // Sin un solo permiso, la credencial no autentica, ni siquiera para
    // /v1/estudio. O quien la concedió ya no puede dar nada (p. ej. bajó de
    // MANAGER a RECEPCIÓN), o a su app ya no se le deja pedir lo que tenía.
    const porLaApp = scopesDeLaApp !== undefined
      && scopesEfectivos({ credencial: scopesCredencial, rolDeQuienConcedio: rol, plan }).length > 0;
    return {
      ok: false, studioId, credencial,
      resultado: error(401, 'invalid_token', porLaApp
        ? 'Esta aplicación ya no puede pedir ninguno de los permisos que tenía.'
        : 'Quien concedió este acceso ya no puede darlo.', requestId),
    };
  }

  if (credencial.tipo === 'clave') {
    // Último uso, como mucho una escritura por minuto y por clave: sin el
    // filtro, cada llamada de una sincronización escribiría una fila.
    const haceUnMinuto = new Date(Date.now() - 60_000).toISOString();
    admin.from('api_claves')
      .update({ ultimo_uso_en: new Date().toISOString(), ultimo_uso_ip: clientIp(req) })
      .eq('id', credencial.claveId)
      .or(`ultimo_uso_en.is.null,ultimo_uso_en.lt.${haceUnMinuto}`)
      .then(() => {}, () => {});
  }

  return { ok: true, ctx: { studioId, credencial, scopes, concedidaPor, rolDeQuienConcedio: rol, requestId } };
}

/** Una fila por llamada autenticada (fire-and-forget: no bloquea la respuesta). */
export function auditarAccesoApi(
  admin: SupabaseClient,
  p: { studioId: string; credencial: CredencialApi; scope: string | null; metodo: string; ruta: string; status: number; ip: string | null },
): void {
  admin.from('oauth_auditoria_accesos').insert({
    studio_id: p.studioId,
    token_id: p.credencial.tipo === 'oauth' ? p.credencial.tokenId : null,
    cliente_id: p.credencial.tipo === 'oauth' ? p.credencial.clienteId : null,
    api_clave_id: p.credencial.tipo === 'clave' ? p.credencial.claveId : null,
    scope_usado: p.scope, metodo: p.metodo, ruta: p.ruta, status_code: p.status, ip: p.ip,
  }).then(() => {}, () => {});
}

const LIMITE_POR_MINUTO = 120;
// Antes de autenticar, por IP: frena a quien prueba credenciales a ciegas. Es
// generoso a propósito: el límite que importa es el de cada credencial.
const LIMITE_POR_IP = 600;

/**
 * Envoltorio de cada endpoint de /api/v1. El handler solo lleva la lógica de
 * negocio; esto hace límite por IP → autenticación → límite por credencial →
 * scope → Idempotency-Key (POST) → handler → auditoría, y responde siempre con
 * `X-Request-Id`.
 */
export async function conApiPublica(
  req: NextRequest,
  /** `scope: null`: basta con una credencial válida del estudio (p. ej. /v1/estudio). */
  opts: { scope: ScopeOAuth | null; ruta: string; limitePorMinuto?: number },
  handler: (ctx: ContextoApi, admin: SupabaseClient) => Promise<ResultadoApi>,
): Promise<Response> {
  const requestId = randomUUID();
  const responder = (r: ResultadoApi) =>
    NextResponse.json(r.body, { status: r.status, headers: { 'X-Request-Id': requestId, ...(r.headers ?? {}) } });

  const porIp = await enforceRateLimit(req, 'api-v1-ip', { max: LIMITE_POR_IP, windowSeconds: 60 });
  if (porIp) return porIp;

  const admin = getSupabaseAdmin();
  if (!admin) return responder(error(503, 'server_error', 'Servicio no disponible.', requestId));

  const ip = clientIp(req);
  const auditar = (ctx: { studioId: string; credencial: CredencialApi }, status: number) =>
    auditarAccesoApi(admin, { studioId: ctx.studioId, credencial: ctx.credencial, scope: opts.scope, metodo: req.method, ruta: opts.ruta, status, ip });

  const auth = await autenticarApiPublica(req, admin, requestId);
  if (!auth.ok) {
    if (auth.studioId && auth.credencial) auditar({ studioId: auth.studioId, credencial: auth.credencial }, auth.resultado.status);
    return responder(auth.resultado);
  }
  const { ctx } = auth;

  // Límite por CREDENCIAL, no por IP: una integración que llama desde varias
  // máquinas comparte su cupo, y dos estudios detrás de la misma IP no se pisan.
  const idCredencial = ctx.credencial.tipo === 'clave' ? `k:${ctx.credencial.claveId}` : `t:${ctx.credencial.tokenId}`;
  const ventana = 60;
  const limite = await rateLimit(`api-v1:${idCredencial}`, { max: opts.limitePorMinuto ?? LIMITE_POR_MINUTO, windowSeconds: ventana });
  if (!limite.allowed) {
    auditar(ctx, 429);
    const r = error(429, 'rate_limited', 'Demasiadas peticiones con esta credencial. Espera y reintenta.', requestId);
    return responder({ ...r, headers: { 'Retry-After': String(retryAfterSeconds(limite.resetAt, ventana)) } });
  }

  if (opts.scope && !ctx.scopes.includes(opts.scope)) {
    auditar(ctx, 403);
    return responder(error(403, 'insufficient_scope', `Esta credencial no tiene el permiso «${opts.scope}».`, requestId));
  }

  // Idempotency-Key, solo en los POST (idempotencia.ts): un reintento con la
  // misma clave no vuelve a crear nada, recibe la respuesta del primero.
  let idem: Idem | null = null;
  if (req.method === 'POST') {
    const clave = leerClaveIdempotencia(req.headers.get(CABECERA_IDEMPOTENCIA));
    if (clave === 'invalida') {
      auditar(ctx, 400);
      return responder(error(400, 'invalid_request', 'Idempotency-Key tiene que ser texto ASCII visible, de 1 a 255 caracteres.', requestId));
    }
    if (clave) {
      // `clone()`: el handler vuelve a leer el cuerpo con `req.json()`.
      const cuerpo = await req.clone().text();
      idem = { studioId: ctx.studioId, credencial: credencialDeIdempotencia(ctx.credencial), clave, huella: huellaPeticion(opts.ruta, cuerpo), ruta: opts.ruta };
      const previa = await reservarIdempotencia(admin, idem, requestId);
      if (previa) {
        auditar(ctx, previa.status);
        return responder(previa);
      }
    }
  }

  let resultado: ResultadoApi;
  try {
    resultado = await handler(ctx, admin);
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'api-publica' }, extra: { ruta: opts.ruta, requestId } });
    resultado = error(500, 'server_error', 'Error interno. Si se repite, cita este requestId.', requestId);
  }
  if (idem) await cerrarIdempotencia(admin, idem, resultado);
  auditar(ctx, resultado.status);
  return responder(resultado);
}

interface Idem { studioId: string; credencial: string; clave: string; huella: string; ruta: string }

/**
 * Aparta la clave antes de ejecutar. `null` = adelante (la petición es la
 * primera con esta clave); si no, la respuesta que hay que dar sin ejecutar
 * nada: la guardada, un conflicto o «sigue en marcha».
 */
async function reservarIdempotencia(admin: SupabaseClient, idem: Idem, requestId: string, intento = 0): Promise<ResultadoApi | null> {
  const id = { studio_id: idem.studioId, credencial: idem.credencial, clave: idem.clave };
  const { error: errInsert } = await admin.from('api_idempotencia').insert({ ...id, ruta: idem.ruta, huella: idem.huella });
  if (!errInsert) return null;
  // Si no se puede comprobar, no se ejecuta: hacerlo podría duplicar justo lo
  // que la clave existe para evitar.
  const noComprobable = () => error(503, 'server_error', 'No se ha podido comprobar la Idempotency-Key. Reintenta con la misma clave.', requestId);
  if (errInsert.code !== '23505') {
    Sentry.captureException(new Error(`api_idempotencia insert: ${errInsert.message}`), { tags: { area: 'api-publica' } });
    return noComprobable();
  }
  const { data: fila, error: errLeer } = await admin.from('api_idempotencia')
    .select('huella, estado, status_http, respuesta, creado_en').match(id).maybeSingle();
  if (errLeer) return noComprobable();
  // Borrada entre medias (caducó): se vuelve a intentar apartarla, una vez.
  if (!fila) return intento === 0 ? reservarIdempotencia(admin, idem, requestId, 1) : noComprobable();

  const d = decidirConClaveUsada(fila as FilaIdempotencia, idem.huella, new Date());
  if (d.tipo === 'repetir') return { status: d.status, body: d.cuerpo, headers: { 'Idempotent-Replayed': 'true' } };
  if (d.tipo === 'conflicto') {
    return error(422, 'idempotency_conflict', 'Esta Idempotency-Key ya se usó con otra petición (otra ruta u otro cuerpo). Usa una clave nueva.', requestId);
  }
  const enCurso = () => ({
    ...error(409, 'request_in_progress', 'Una petición con esta Idempotency-Key sigue en marcha. Reintenta en un momento.', requestId),
    headers: { 'Retry-After': '1' },
  });
  if (d.tipo === 'en_curso') return enCurso();
  // Caducada o abandonada: se reemplaza solo si sigue siendo la misma fila
  // (otro reintento simultáneo puede habérsela quedado).
  const { data: tomada } = await admin.from('api_idempotencia')
    .update({ ruta: idem.ruta, huella: idem.huella, estado: 'EN_CURSO', status_http: null, respuesta: null, creado_en: new Date().toISOString(), completado_en: null })
    .match(id).eq('creado_en', (fila as FilaIdempotencia).creado_en).select('clave');
  return tomada?.length ? null : enCurso();
}

/** Guarda la respuesta para los reintentos; un 5xx no se guarda (el reintento debe ejecutarse). */
async function cerrarIdempotencia(admin: SupabaseClient, idem: Idem, r: ResultadoApi): Promise<void> {
  const id = { studio_id: idem.studioId, credencial: idem.credencial, clave: idem.clave };
  const { error: e } = seGuarda(r.status)
    ? await admin.from('api_idempotencia')
        .update({ estado: 'COMPLETADA', status_http: r.status, respuesta: r.body ?? null, completado_en: new Date().toISOString() })
        .match(id).eq('huella', idem.huella)
    : await admin.from('api_idempotencia').delete().match(id).eq('huella', idem.huella);
  if (e) Sentry.captureException(new Error(`api_idempotencia cerrar: ${e.message}`), { tags: { area: 'api-publica' } });
}

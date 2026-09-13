// Saneado común de todo lo que sale hacia Sentry (servidor, edge y navegador).
//
// `sendDefaultPii: false` no basta. Solo deja fuera cabeceras, cookies y cuerpos
// por NOMBRE; lo que el propio código mete en `extra`, `contexts`, el mensaje o
// una URL con querystring sale tal cual, y el scrubber del servidor de Sentry no
// reconoce identificadores españoles (NIF/NIE, IBAN, móvil). Un NIF real llegó
// así a Sentry desde un aviso de Veri*Factu.
//
// Regla: a Sentry van ids opacos y códigos de error, nunca datos de una persona.
// Este módulo lo garantiza aunque alguien se equivoque en un `captureException`.
//
// Puro y sin imports de runtime (solo tipos), para poder probarlo con node --test
// y usarlo en el edge runtime.

import type { Breadcrumb } from '@sentry/nextjs';

const FILTRADO = '[Filtrado]';

// Claves cuyo VALOR no se envía nunca, se llamen como se llamen en camelCase o
// snake_case (se compara quitando `_` y `-`, en minúsculas).
// `name` y `code` NO están a propósito: Sentry los usa en contexts (os.name,
// browser.name) y el código en `extra.code` para códigos de error de Postgres,
// que no son de nadie y hacen falta para depurar.
const CLAVES_SENSIBLES = new Set([
  'email', 'correo', 'mail', 'socioemail', 'receptoremail',
  'telefono', 'tel', 'phone', 'movil', 'sociotelefono',
  'nif', 'dni', 'nie', 'cif', 'receptornif', 'documento', 'numerodocumento',
  'iban', 'sepaiban',
  'nombre', 'apellido', 'apellidos', 'socionombre', 'receptornombre', 'nombrecompleto', 'fullname',
  'direccion', 'address', 'codigopostal', 'postalcode',
  'fechanacimiento', 'birthdate', 'genero',
  'firma', 'password', 'contrasena', 'secret', 'secreto',
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'authorization', 'cookie', 'cookies', 'authcode',
  'metadata', 'notas', 'nota', 'mensaje', 'cuerpo', 'texto',
]);

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RE_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const RE_CLAVE_STRIPE = /\b(?:sk|rk|whsec)_(?:live|test)?_?[A-Za-z0-9]{8,}\b/g;
const RE_IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const RE_DNI = /\b\d{8}[A-HJ-NP-TV-Z]\b/gi;
const RE_NIE = /\b[XYZ]\d{7}[A-Z]\b/gi;
const RE_CIF = /\b[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]\b/g;
const RE_MOVIL = /(?:\+34[ ]?)?\b[6789]\d{2}[ ]?\d{3}[ ]?\d{3}\b/g;
const RE_BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

const PROFUNDIDAD_MAX = 8;

function normalizarClave(clave: string): string {
  return clave.toLowerCase().replace(/[_-]/g, '');
}

export function esClaveSensible(clave: string): boolean {
  return CLAVES_SENSIBLES.has(normalizarClave(clave));
}

/** Enmascara en un texto libre cualquier dato personal o secreto reconocible. */
export function limpiarTexto(texto: string): string {
  return texto
    .replace(RE_JWT, '[jwt]')
    .replace(RE_BEARER, 'Bearer [token]')
    .replace(RE_CLAVE_STRIPE, '[clave]')
    .replace(RE_EMAIL, '[email]')
    .replace(RE_IBAN, '[iban]')
    .replace(RE_NIE, '[nie]')
    .replace(RE_DNI, '[nif]')
    .replace(RE_CIF, '[cif]')
    .replace(RE_MOVIL, '[tel]');
}

/**
 * Quita el fragmento y los VALORES de la querystring (los nombres se quedan,
 * que son útiles para depurar). Acepta URLs absolutas y relativas.
 */
export function limpiarUrl(url: string): string {
  const sinFragmento = url.split('#')[0];
  const [base, query] = sinFragmento.split('?');
  const baseLimpia = limpiarTexto(base);
  if (query === undefined) return baseLimpia;
  const claves = query
    .split('&')
    .filter(Boolean)
    .map((par) => par.split('=')[0])
    .map((clave) => {
      try {
        return encodeURIComponent(decodeURIComponent(clave));
      } catch {
        return '_';
      }
    });
  return claves.length > 0 ? `${baseLimpia}?${claves.map((c) => `${c}=${FILTRADO}`).join('&')}` : baseLimpia;
}

function pareceUrl(clave: string, valor: string): boolean {
  return /url|href|uri|query|path|referer|referrer|to|from/i.test(clave) || /^(https?:\/\/|\/)[^\s]*[?#]/.test(valor);
}

/** Recorre un valor cualquiera y devuelve una copia saneada. Nunca lanza. */
export function limpiarValor(valor: unknown, clave = '', profundidad = 0, vistos = new WeakSet<object>()): unknown {
  if (clave && esClaveSensible(clave) && valor !== null && valor !== undefined) return FILTRADO;
  if (typeof valor === 'string') return pareceUrl(clave, valor) ? limpiarUrl(valor) : limpiarTexto(valor);
  if (valor === null || typeof valor !== 'object') return valor;
  if (profundidad >= PROFUNDIDAD_MAX) return '[Profundidad]';
  if (vistos.has(valor)) return '[Circular]';
  vistos.add(valor);
  if (Array.isArray(valor)) return valor.map((v) => limpiarValor(v, '', profundidad + 1, vistos));
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[k] = limpiarValor(v, k, profundidad + 1, vistos);
  }
  return salida;
}

type MigaSaneable = Pick<Breadcrumb, 'message' | 'data'>;

/** `beforeBreadcrumb`: las migas de fetch/xhr/navegación llevan URLs completas. */
export function sanearMigaSentry<B extends MigaSaneable>(miga: B): B {
  if (typeof miga.message === 'string') miga.message = limpiarTexto(miga.message);
  if (miga.data) {
    const data = { ...miga.data } as Record<string, unknown>;
    for (const k of Object.keys(data)) {
      if (k === 'http.query' || k === 'http.fragment') data[k] = FILTRADO;
      else data[k] = limpiarValor(data[k], k);
    }
    miga.data = data;
  }
  return miga;
}

interface EventoSaneable {
  message?: string;
  logentry?: { message?: string; params?: unknown[] };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  user?: { id?: string | number } & Record<string, unknown>;
  request?: { url?: string; query_string?: unknown; data?: unknown; cookies?: unknown; headers?: Record<string, string> };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: MigaSaneable[];
  transaction?: string;
  spans?: Array<{ description?: string; data?: Record<string, unknown> }>;
}

/** `beforeSend` y `beforeSendTransaction`: sanea el evento completo en sitio. */
export function sanearEventoSentry<E extends EventoSaneable>(evento: E): E {
  try {
    if (evento.message) evento.message = limpiarTexto(evento.message);
    if (evento.logentry) {
      if (evento.logentry.message) evento.logentry.message = limpiarTexto(evento.logentry.message);
      if (evento.logentry.params) evento.logentry.params = limpiarValor(evento.logentry.params) as unknown[];
    }
    if (evento.extra) evento.extra = limpiarValor(evento.extra) as E['extra'];
    if (evento.contexts) evento.contexts = limpiarValor(evento.contexts) as E['contexts'];
    if (evento.tags) evento.tags = limpiarValor(evento.tags) as E['tags'];
    if (evento.user) evento.user = (evento.user.id !== undefined ? { id: evento.user.id } : {}) as E['user'];
    if (evento.request) {
      if (evento.request.url) evento.request.url = limpiarUrl(evento.request.url);
      delete evento.request.query_string;
      delete evento.request.data;
      delete evento.request.cookies;
      if (evento.request.headers) {
        const cabeceras: Record<string, string> = {};
        for (const [k, v] of Object.entries(evento.request.headers)) {
          if (/authorization|cookie|token|signature|firma/i.test(k)) continue;
          cabeceras[k] = /referer|referrer/i.test(k) ? limpiarUrl(v) : limpiarTexto(v);
        }
        evento.request.headers = cabeceras;
      }
    }
    evento.exception?.values?.forEach((ex) => {
      if (ex.value) ex.value = limpiarTexto(ex.value);
    });
    evento.breadcrumbs?.forEach((b) => sanearMigaSentry(b));
    if (evento.transaction) evento.transaction = limpiarUrl(evento.transaction);
    evento.spans?.forEach((span) => {
      if (span.description) span.description = limpiarUrl(span.description);
      if (span.data) span.data = limpiarValor(span.data) as Record<string, unknown>;
    });
  } catch {
    // Un saneado que revienta no puede tumbar el informe del error original,
    // pero tampoco puede dejar pasar el evento sin sanear: se reduce a lo mínimo.
    return { message: '[evento no saneable]', exception: evento.exception ? { values: [] } : undefined } as E;
  }
  return evento;
}

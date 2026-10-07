// ─────────────────────────────────────────────────────────────────────────────
// Arnés para pasar las llamadas REALES del servidor a Stripe por `stripe-mock`
// (el simulador oficial de Stripe, que valida cada petición contra su OpenAPI).
// Solo para `lib/billing/stripe-mock.integracion.test.ts`: nada de producción lo
// importa, y se niega a arrancar en producción o con una clave live.
//
// Qué hace, sin tocar el código de producción:
//   · Carga las rutas de `app/api/**` tal cual (resuelve `@/`, compila TS/TSX con
//     esbuild) y sustituye SOLO lo que no puede correr fuera de Next: la base de
//     datos (una en memoria), quién es la alumna, el límite de peticiones y `after()`.
//   · Todo `new Stripe(...)` del proceso habla con stripe-mock: se fuerza en el
//     prototipo del SDK (`_getPropsFromConfig`) y, por si acaso, el `fetch` del
//     cliente reescribe CUALQUIER URL a stripe-mock. Ninguna petición sale a Stripe.
//   · Apunta cada petición (método, ruta, cuenta conectada, clave de idempotencia,
//     parámetros) y lo que contestó stripe-mock. Un 4xx de stripe-mock es una
//     petición que Stripe rechazaría.
//   · stripe-mock contesta siempre con su fixture (no guarda estado): para seguir
//     un flujo más allá (un PaymentIntent `succeeded`, una sesión `complete`), la
//     prueba puede RETOCAR la respuesta DESPUÉS de que stripe-mock haya validado la
//     petición. La validación no se toca.
// ─────────────────────────────────────────────────────────────────────────────
import * as moduloNode from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';

export const PUERTO_STRIPE_MOCK = Number(process.env.STRIPE_MOCK_PORT ?? 12191);
const BASE_STRIPE_MOCK = `http://localhost:${PUERTO_STRIPE_MOCK}`;
/** El `fetch` de verdad: el global se envuelve para que nada salga de localhost. */
const fetchOriginal: typeof fetch = globalThis.fetch.bind(globalThis);

// ── ¿Está stripe-mock en marcha? ─────────────────────────────────────────────
async function contesta(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE_STRIPE_MOCK}/v1/balance`, {
      headers: { Authorization: 'Bearer sk_test_123' }, signal: AbortSignal.timeout(1500),
    });
    return r.status === 200;
  } catch {
    return false;
  }
}

/**
 * En local, si no está, las pruebas se saltan. En la CI (`STRIPE_MOCK_OBLIGATORIO=1`,
 * con stripe-mock como servicio del job) saltárselas sería un verde que no ha
 * comprobado nada: se le espera un poco (el contenedor puede tardar en arrancar) y,
 * si no contesta, se falla.
 */
export async function stripeMockEnMarcha(): Promise<boolean> {
  if (await contesta()) return true;
  if (process.env.STRIPE_MOCK_OBLIGATORIO !== '1') return false;
  for (let intento = 0; intento < 30; intento++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await contesta()) return true;
  }
  throw new Error(`STRIPE_MOCK_OBLIGATORIO=1 y stripe-mock no contesta en ${BASE_STRIPE_MOCK}`);
}

// ── Peticiones apuntadas ─────────────────────────────────────────────────────
export interface PeticionStripe {
  metodo: string;
  /** `/v1/checkout/sessions`, sin query. */
  ruta: string;
  query: string;
  cuenta: string | null;
  idempotencia: string | null;
  /** El cuerpo `x-www-form-urlencoded` tal cual (o la query en un GET). */
  cuerpo: string;
  estado: number;
  /** El mensaje de stripe-mock cuando la rechaza. */
  error: string | null;
  /** Se mandó `payment_method_types` como `allowed_payment_method_types` (ver `cuerpoParaLaVersionDeStripeMock`). */
  traducido: boolean;
}

type Retoque = (p: { metodo: string; ruta: string; params: URLSearchParams }, json: Record<string, unknown>) => Record<string, unknown> | void;

interface EstadoArnes {
  peticiones: PeticionStripe[];
  retoques: Retoque[];
  falsos: Record<string, Record<string, (...a: unknown[]) => unknown>>;
  despues: Promise<unknown>[];
  /** Peticiones de red que intentaron salir de localhost (se cortan antes de salir). */
  fueraDeLocal: string[];
}

const G = globalThis as unknown as { __arnesStripeMock?: EstadoArnes };

export function estado(): EstadoArnes {
  if (!G.__arnesStripeMock) G.__arnesStripeMock = { peticiones: [], retoques: [], falsos: {}, despues: [], fueraDeLocal: [] };
  return G.__arnesStripeMock;
}

/** Vacía lo apuntado y los retoques entre prueba y prueba. */
export function reiniciar(): void {
  const e = estado();
  e.peticiones.length = 0;
  e.retoques.length = 0;
  e.despues.length = 0;
  e.fueraDeLocal.length = 0;
}

/** Cambia la respuesta (ya validada) de las peticiones que casen. */
export function retocar(r: Retoque): void {
  estado().retoques.push(r);
}

/** Espera a lo que la ruta dejó para `after()` (el webhook procesa así). */
export async function esperarDespues(): Promise<void> {
  const e = estado();
  while (e.despues.length) {
    const ps = e.despues.splice(0);
    await Promise.allSettled(ps);
  }
}

// ── Módulos que se sustituyen ────────────────────────────────────────────────
// Ruta (relativa a la raíz, o especificador de paquete) → exportaciones que se
// desvían a `estado().falsos[clave][nombre]`. El resto del módulo es el real.
const SUSTITUIDOS: Record<string, string[]> = {
  'lib/db/supabase-admin.ts': ['getSupabaseAdmin'],
  'lib/auth-server.ts': ['verificarUsuarioSupabase', 'usuarioSupabaseConPaso', 'verificarSesionStaff'],
  'lib/rate-limit.ts': ['enforceRateLimit', 'rateLimit'],
  'next/server.js': ['after'],
};

export function falsear(clave: keyof typeof SUSTITUIDOS | string, impl: Record<string, (...a: never[]) => unknown>): void {
  estado().falsos[clave] = { ...(estado().falsos[clave] ?? {}), ...(impl as Record<string, (...a: unknown[]) => unknown>) };
}

const RAIZ = process.cwd();
const EXTENSIONES = ['.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];

function probar(base: string): string | null {
  const esFichero = (p: string) => existsSync(p) && statSync(p).isFile();
  if (esFichero(base)) return base;
  for (const e of EXTENSIONES) if (esFichero(base + e)) return base + e;
  return null;
}

function claveSustituida(url: string): string | null {
  if (!url.startsWith('file:') || url.includes('?real')) return null;
  const p = fileURLToPath(url);
  for (const clave of Object.keys(SUSTITUIDOS)) {
    if (clave.startsWith('lib/') ? p === path.join(RAIZ, clave) : p.endsWith(`/node_modules/${clave}`)) return clave;
  }
  return null;
}

// `registerHooks` (Node ≥ 22.15, síncrono y en el mismo hilo): los tipos de
// @types/node 20 aún no lo traen, así que se declara aquí lo que se usa.
interface Resuelto { url: string; format?: string; shortCircuit?: boolean }
interface Cargado { format: string; source: string | Uint8Array; shortCircuit?: boolean }
interface Ganchos {
  resolve(especificador: string, contexto: { parentURL?: string }, siguiente: (e: string, c: { parentURL?: string }) => Resuelto): Resuelto;
  load(url: string, contexto: object, siguiente: (u: string, c: object) => Cargado): Cargado;
}
const registerHooks = (moduloNode as unknown as { registerHooks: (g: Ganchos) => void }).registerHooks;

let ganchosPuestos = false;

function ponerGanchos(): void {
  if (ganchosPuestos) return;
  ganchosPuestos = true;
  registerHooks({
    resolve(especificador, contexto, siguiente) {
      const padre = contexto.parentURL ?? '';
      const delProyecto = padre.startsWith('file:') && !padre.includes('/node_modules/');
      if (especificador.startsWith('@/')) {
        const p = probar(path.join(RAIZ, especificador.slice(2)));
        if (p) return { url: pathToFileURL(p).href, shortCircuit: true };
      }
      if (delProyecto && (especificador.startsWith('./') || especificador.startsWith('../'))) {
        const [sinQuery, query] = especificador.split('?');
        const p = probar(path.resolve(path.dirname(fileURLToPath(padre)), sinQuery));
        if (p) return { url: pathToFileURL(p).href + (query ? `?${query}` : ''), shortCircuit: true };
      }
      try {
        return siguiente(especificador, contexto);
      } catch (e) {
        // `next/server`, `next/headers`…: Next no declara `exports` y Node exige la extensión.
        if (!especificador.startsWith('.') && !especificador.startsWith('node:') && !especificador.endsWith('.js')) {
          try { return siguiente(`${especificador}.js`, contexto); } catch { /* el error original */ }
        }
        throw e;
      }
    },
    load(url, contexto, siguiente) {
      const clave = claveSustituida(url);
      if (clave) {
        const nombres = SUSTITUIDOS[clave];
        const real = `${url}?real`;
        const fuente = [
          `export * from ${JSON.stringify(real)};`,
          ...nombres.map(n => `export const ${n} = (...a) => {
            const f = globalThis.__arnesStripeMock?.falsos?.[${JSON.stringify(clave)}]?.[${JSON.stringify(n)}];
            if (!f) throw new Error('arnés stripe-mock: falta el falso de ${clave}#${n}');
            return f(...a);
          };`),
        ].join('\n');
        return { format: 'module', source: fuente, shortCircuit: true };
      }
      if (!url.startsWith('file:')) return siguiente(url, contexto);
      const p = fileURLToPath(url.split('?')[0]);
      if (p.includes('/node_modules/')) return siguiente(url, contexto);
      if (p.endsWith('.json')) {
        return { format: 'module', source: `export default ${readFileSync(p, 'utf8')};`, shortCircuit: true };
      }
      if (p.endsWith('.ts') || p.endsWith('.tsx')) {
        const { code } = transformSync(readFileSync(p, 'utf8'), {
          loader: p.endsWith('.tsx') ? 'tsx' : 'ts', format: 'esm', jsx: 'automatic', target: 'node22',
          sourcemap: 'inline', sourcefile: p,
        });
        return { format: 'module', source: code, shortCircuit: true };
      }
      return siguiente(url, contexto);
    },
  });
}

// ── El SDK de Stripe, contra stripe-mock ─────────────────────────────────────
type StripeCtor = { prototype: { _getPropsFromConfig: (c: unknown) => Record<string, unknown> }; createFetchHttpClient: (f: typeof fetch) => unknown };

// ⚠️ Diferencia de VERSIÓN, no de validez. stripe-mock 0.206.0 valida contra la
// especificación de `2026-09-30.endive`, y nuestro SDK fija `2026-06-24.dahlia`
// (lo manda en `Stripe-Version`). En endive Stripe QUITÓ `payment_method_types` al
// crear PaymentIntents, SetupIntents y sesiones de Checkout (cambio incompatible; lo
// sustituye `allowed_payment_method_types`, que llegó en `2026-07-29.dahlia`):
//   https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions
//   https://docs.stripe.com/changelog/endive/2026-09-30/removes-the-payment-method-types-parameter-from-payment-intents-and-setup-intents
// En nuestra versión es válido, así que para VALIDAR se manda con el nombre nuevo
// (mismo tipo: lista de métodos; así se siguen comprobando los valores) y se apunta
// la petición original. Si algún día se sube el `apiVersion` a endive, esto deja de
// ser un falso positivo: hay que migrar esas llamadas (ver docs/STRIPE-MODO-TEST.md).
const RUTAS_SIN_PAYMENT_METHOD_TYPES_EN_ENDIVE = /^\/v1\/(checkout\/sessions|payment_intents|setup_intents)(\/[^/]+(\/confirm)?)?$/;

export function cuerpoParaLaVersionDeStripeMock(ruta: string, cuerpo: string): { cuerpo: string; traducido: boolean } {
  if (!RUTAS_SIN_PAYMENT_METHOD_TYPES_EN_ENDIVE.test(ruta) || !/(^|&)payment_method_types(\[|%5B)/.test(cuerpo)) {
    return { cuerpo, traducido: false };
  }
  return { cuerpo: cuerpo.replace(/(^|&)payment_method_types(?=\[|%5B)/g, '$1allowed_payment_method_types'), traducido: true };
}

async function fetchAStripeMock(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
  const destino = `${BASE_STRIPE_MOCK}${u.pathname}${u.search}`;
  const cabeceras = new Headers(init?.headers);
  const metodo = (init?.method ?? 'GET').toUpperCase();
  const cuerpo = typeof init?.body === 'string' ? init.body : '';
  const paraValidar = metodo === 'POST' ? cuerpoParaLaVersionDeStripeMock(u.pathname, cuerpo) : { cuerpo, traducido: false };
  const salida = new Headers(init?.headers);
  salida.delete('content-length');
  let r: Response;
  try {
    r = await fetchOriginal(destino, {
      ...init, headers: salida, ...(metodo === 'POST' ? { body: paraValidar.cuerpo } : {}), signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // Que no se pierda: una petición que no llegó a stripe-mock también es un fallo de la prueba.
    estado().peticiones.push({
      metodo, ruta: u.pathname, query: u.search, cuenta: cabeceras.get('stripe-account'),
      idempotencia: cabeceras.get('idempotency-key'), cuerpo, estado: 0, error: `sin respuesta: ${String(e)}`, traducido: paraValidar.traducido,
    });
    throw e;
  }
  const texto = await r.text();
  let json: Record<string, unknown>;
  try { json = JSON.parse(texto) as Record<string, unknown>; } catch { json = { texto }; }
  const params = new URLSearchParams(metodo === 'GET' || metodo === 'DELETE' ? u.search : cuerpo);
  const error = r.status >= 400 ? String((json.error as { message?: string } | undefined)?.message ?? texto) : null;
  estado().peticiones.push({
    metodo, ruta: u.pathname, query: u.search, cuenta: cabeceras.get('stripe-account'),
    idempotencia: cabeceras.get('idempotency-key'), cuerpo: metodo === 'GET' ? u.search.slice(1) : cuerpo,
    estado: r.status, error, traducido: paraValidar.traducido,
  });
  let status = r.status;
  if (r.status < 400) {
    for (const ret of estado().retoques) {
      const otro = ret({ metodo, ruta: u.pathname, params }, json);
      if (otro) json = otro;
    }
    // Un retoque puede simular que Stripe contesta con error (p. ej. no deja cerrar una
    // sesión que se está pagando): `{ __estado: 400, error: {…} }`. La petición ya pasó
    // la validación de stripe-mock y queda apuntada como válida.
    if (typeof json.__estado === 'number') {
      status = json.__estado;
      const { __estado: _e, ...resto } = json;
      void _e;
      json = resto;
    }
  }
  const h = new Headers(r.headers);
  h.delete('content-length');
  return new Response(JSON.stringify(json), { status, headers: h });
}

function apuntarAStripeMock(Stripe: StripeCtor): void {
  const proto = Stripe.prototype;
  if ((proto as { __arnes?: boolean }).__arnes) return;
  const original = proto._getPropsFromConfig;
  const cliente = Stripe.createFetchHttpClient(fetchAStripeMock as typeof fetch);
  proto._getPropsFromConfig = function (config: unknown) {
    const props = original.call(this, config) ?? {};
    return { ...props, host: 'localhost', port: String(PUERTO_STRIPE_MOCK), protocol: 'http', maxNetworkRetries: 0, httpClient: cliente };
  };
  (proto as { __arnes?: boolean }).__arnes = true;
}

export const CLAVE_PRUEBA = 'sk_test_51MockArnesTentareSoloStripeMock';
export const SECRETO_WEBHOOK = 'whsec_arnes_stripe_mock_plataforma';
export const SECRETO_WEBHOOK_CONNECT = 'whsec_arnes_stripe_mock_connect';

/** Pone el entorno, los ganchos y el SDK apuntando a stripe-mock. Llamar ANTES de importar ninguna ruta. */
export async function arrancarArnes(): Promise<void> {
  const env = process.env as Record<string, string | undefined>;
  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    throw new Error('arnés stripe-mock: nunca en producción');
  }
  if ((env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_') || (env.STRIPE_SECRET_KEY ?? '').startsWith('rk_live_')) {
    throw new Error('arnés stripe-mock: hay una clave LIVE en el entorno; no se arranca');
  }
  // Nada de lo que hay en el entorno de la máquina: solo lo justo, y de prueba.
  for (const k of Object.keys(env)) {
    if (/^(STRIPE_|NEXT_PUBLIC_STRIPE_|SUPABASE_|NEXT_PUBLIC_SUPABASE_|RESEND_|SENTRY_|NEXT_PUBLIC_SENTRY_|INNGEST_|UPSTASH_|TWILIO_|WHATSAPP_|VAPID_|NEXT_PUBLIC_VAPID_|POSTHOG_|NEXT_PUBLIC_POSTHOG_)/.test(k) && !k.startsWith('STRIPE_MOCK_')) delete env[k];
  }
  env.STRIPE_SECRET_KEY = CLAVE_PRUEBA;
  env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_51MockArnesTentareSoloStripeMock';
  env.STRIPE_WEBHOOK_SECRET = SECRETO_WEBHOOK;
  env.STRIPE_CONNECT_WEBHOOK_SECRET = SECRETO_WEBHOOK_CONNECT;
  env.NEXT_PUBLIC_APP_URL = 'http://localhost:3001';
  // El webhook resuelve la cuenta de la plataforma con un `fetch` directo a api.stripe.com
  // si esto falta (app/api/stripe/webhook/route.ts): fijada, no lo intenta.
  env.STRIPE_PLATFORM_ACCOUNT_ID = 'acct_1ArnesPlataforma';
  // Y nada de lo que corra aquí sale de la máquina: cualquier `fetch` fuera de localhost
  // (Stripe a pelo, Resend, Supabase…) falla sin salir y queda apuntado para la prueba.
  const local = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    if (!local.has(url.hostname)) {
      estado().fueraDeLocal.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`);
      throw new Error(`arnés stripe-mock: petición cortada fuera de localhost (${url.origin})`);
    }
    return fetchOriginal(entrada, init);
  }) as typeof fetch;
  ponerGanchos();
  const esm = (await import('stripe')).default as unknown as StripeCtor;
  apuntarAStripeMock(esm);
  try {
    const cjs = moduloNode.createRequire(import.meta.url)('stripe') as StripeCtor & { default?: StripeCtor; Stripe?: StripeCtor };
    for (const c of [cjs, cjs.default, cjs.Stripe]) if (c?.prototype?._getPropsFromConfig) apuntarAStripeMock(c);
  } catch { /* solo ESM */ }
  // Por defecto: sin límite de peticiones y `after()` se espera con `esperarDespues()`.
  falsear('lib/rate-limit.ts', {
    enforceRateLimit: async () => null,
    rateLimit: async () => ({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }),
  });
  falsear('next/server.js', {
    after: (tarea: unknown) => {
      const p = typeof tarea === 'function' ? Promise.resolve().then(() => (tarea as () => unknown)()) : Promise.resolve(tarea);
      estado().despues.push(p);
    },
  });
}

/** La alumna que hace la petición (lo que en producción sale de su JWT). */
export function comoAlumna(usuario: { userId: string; email: string } | null): void {
  falsear('lib/auth-server.ts', {
    verificarUsuarioSupabase: async () => usuario,
    usuarioSupabaseConPaso: async () => (usuario ? { usuario, paso: 'ok' } : null),
    verificarSesionStaff: async () => null,
  });
}

/** La persona del estudio que hace la petición (lo que en producción sale de su sesión del panel). */
export function comoEstudio(sesion: { userId: string; studioId: string; rol: string; email?: string }): void {
  falsear('lib/auth-server.ts', {
    verificarUsuarioSupabase: async () => null,
    usuarioSupabaseConPaso: async () => null,
    verificarSesionStaff: async () => ({ email: 'estudio@example.com', ...sesion }),
  });
}

// ── Una base de datos en memoria con la forma del cliente de Supabase ─────────
type Fila = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
export type Rpc = (args: Record<string, unknown>, db: BaseMemoria) => Res | Promise<Res>;

export interface Escritura { tabla: string; op: 'insert' | 'update' | 'upsert' | 'delete'; payload: unknown; filtros: string[] }

export interface BaseMemoria {
  tablas: Record<string, Fila[]>;
  escrituras: Escritura[];
  rpcsLlamadas: { nombre: string; args: Record<string, unknown> }[];
  /** Cada consulta resuelta (`tabla op filtros`), para entender qué lee una ruta. */
  consultas: string[];
  cliente: unknown;
}

const comparar = (a: unknown, b: unknown) => (a == null || b == null ? NaN : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

export function baseEnMemoria(tablas: Record<string, Fila[]>, rpcs: Record<string, Rpc> = {}): BaseMemoria {
  const db: BaseMemoria = { tablas, escrituras: [], rpcsLlamadas: [], consultas: [], cliente: null };

  const consulta = (tabla: string) => {
    let op: 'select' | Escritura['op'] = 'select';
    let payload: unknown = null;
    let conflicto: string[] = ['id'];
    let devolver = false;
    let una: 'no' | 'single' | 'maybe' = 'no';
    let limite: number | null = null;
    let cabeza = false;
    const filtros: ((f: Fila) => boolean)[] = [];
    const apuntes: string[] = [];
    const filtro = (desc: string, fn: (f: Fila) => boolean) => { apuntes.push(desc); filtros.push(fn); };

    const resolver = (): Res => {
      db.consultas.push(`${tabla} ${op} ${apuntes.join(' & ')}`);
      const filas = (db.tablas[tabla] ??= []);
      const casan = () => filas.filter(f => filtros.every(fn => fn(f)));
      let salida: Fila[] = [];
      if (op === 'select') {
        salida = casan();
      } else if (op === 'insert' || op === 'upsert') {
        const nuevas = (Array.isArray(payload) ? payload : [payload]) as Fila[];
        db.escrituras.push({ tabla, op, payload, filtros: apuntes });
        for (const n of nuevas) {
          const ya = op === 'upsert' ? filas.find(f => conflicto.every(c => f[c] === n[c])) : undefined;
          if (ya) { Object.assign(ya, n); salida.push(ya); } else { const c = { ...n }; filas.push(c); salida.push(c); }
        }
      } else if (op === 'update') {
        db.escrituras.push({ tabla, op, payload, filtros: apuntes });
        salida = casan();
        for (const f of salida) Object.assign(f, payload as Fila);
      } else {
        db.escrituras.push({ tabla, op, payload: null, filtros: apuntes });
        salida = casan();
        db.tablas[tabla] = filas.filter(f => !salida.includes(f));
      }
      if (limite !== null) salida = salida.slice(0, limite);
      const count = salida.length;
      if (op !== 'select' && !devolver) return { data: null, error: null, count };
      if (cabeza) return { data: null, error: null, count };
      if (una === 'single') {
        return salida.length === 1 ? { data: salida[0], error: null } : { data: null, error: { message: `single: ${salida.length} filas`, code: 'PGRST116' } };
      }
      if (una === 'maybe') return { data: salida[0] ?? null, error: null };
      return { data: salida, error: null, count };
    };

    const q: Record<string, unknown> = {};
    const metodos: Record<string, (...a: never[]) => unknown> = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (op !== 'select') devolver = true; if (o?.head) cabeza = true; return proxy; },
      insert: (v: unknown) => { op = 'insert'; payload = v; return proxy; },
      upsert: (v: unknown, o?: { onConflict?: string }) => { op = 'upsert'; payload = v; if (o?.onConflict) conflicto = o.onConflict.split(',').map(s => s.trim()); return proxy; },
      update: (v: unknown) => { op = 'update'; payload = v; return proxy; },
      delete: () => { op = 'delete'; return proxy; },
      eq: (c: string, v: unknown) => { filtro(`${c}=${String(v)}`, f => f[c] === v); return proxy; },
      neq: (c: string, v: unknown) => { filtro(`${c}!=${String(v)}`, f => f[c] !== v); return proxy; },
      in: (c: string, vs: readonly unknown[]) => { filtro(`${c} in`, f => vs.includes(f[c])); return proxy; },
      is: (c: string, v: unknown) => { filtro(`${c} is ${String(v)}`, f => (f[c] ?? null) === v); return proxy; },
      not: (c: string, o: string, v: unknown) => {
        if (o === 'is') filtro(`${c} not is`, f => (f[c] ?? null) !== v);
        else if (o === 'in') {
          const vs = String(v).replace(/^\(|\)$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
          filtro(`${c} not in`, f => !vs.includes(String(f[c])));
        } else if (o === 'eq') filtro(`${c} not eq`, f => f[c] !== v);
        return proxy;
      },
      gt: (c: string, v: unknown) => { filtro(`${c}>`, f => comparar(f[c], v) > 0); return proxy; },
      gte: (c: string, v: unknown) => { filtro(`${c}>=`, f => comparar(f[c], v) >= 0); return proxy; },
      lt: (c: string, v: unknown) => { filtro(`${c}<`, f => comparar(f[c], v) < 0); return proxy; },
      lte: (c: string, v: unknown) => { filtro(`${c}<=`, f => comparar(f[c], v) <= 0); return proxy; },
      match: (o: Fila) => { for (const [c, v] of Object.entries(o)) filtro(`${c}=${String(v)}`, f => f[c] === v); return proxy; },
      limit: (n: number) => { limite = n; return proxy; },
      single: () => { una = 'single'; return proxy; },
      maybeSingle: () => { una = 'maybe'; return proxy; },
      then: (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(resolver).then(ok, ko),
    };
    // Lo que no se modela (`or`, `order`, `range`, `ilike`, `returns`…) no filtra: sigue la cadena.
    const proxy: Record<string, unknown> = new Proxy(q, {
      get: (_t, k: string) => metodos[k] ?? (k === 'catch' || k === 'finally' ? undefined : () => proxy),
    });
    return proxy;
  };

  const rpc = (nombre: string, args: Record<string, unknown> = {}) => {
    db.rpcsLlamadas.push({ nombre, args });
    db.consultas.push(`rpc ${nombre}`);
    let una: 'no' | 'single' | 'maybe' = 'no';
    const resolver = async (): Promise<Res> => {
      const r = rpcs[nombre] ? await rpcs[nombre](args, db) : { data: null, error: null };
      if (una !== 'no' && Array.isArray(r.data)) return { ...r, data: r.data[0] ?? null };
      return r;
    };
    const p: Record<string, unknown> = new Proxy({}, {
      get: (_t, k: string) => {
        if (k === 'then') return (ok: (r: Res) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko);
        if (k === 'single') return () => { una = 'single'; return p; };
        if (k === 'maybeSingle') return () => { una = 'maybe'; return p; };
        if (k === 'catch' || k === 'finally') return undefined;
        return () => p;
      },
    });
    return p;
  };

  const sinNada = async () => ({ data: null, error: null });
  db.cliente = {
    from: consulta,
    rpc,
    auth: { getUser: sinNada, admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    storage: { from: () => ({ upload: sinNada, download: sinNada, remove: sinNada, createSignedUrl: sinNada }) },
    channel: () => ({ send: sinNada, subscribe: () => ({}), on: () => ({}) }),
    removeChannel: sinNada,
  };
  return db;
}

/** La base que verán todas las rutas (`getSupabaseAdmin()`). */
export function usarBase(db: BaseMemoria): void {
  falsear('lib/db/supabase-admin.ts', { getSupabaseAdmin: () => db.cliente });
}

/** Lo que intentó salir de localhost (debería estar vacío). */
export function fueraDeLocal(): string[] {
  return [...estado().fueraDeLocal];
}

/** Las peticiones que stripe-mock rechazó. */
export function rechazadas(): PeticionStripe[] {
  return estado().peticiones.filter(p => p.estado >= 400 || p.estado === 0);
}

/** Resumen legible para los mensajes de las aserciones. */
export function resumen(ps: PeticionStripe[] = estado().peticiones): string {
  return ps.map(p => `${p.metodo} ${p.ruta} → ${p.estado}${p.error ? ` (${p.error})` : ''}${p.cuenta ? ` [${p.cuenta}]` : ''}`).join('\n');
}

/** `a[b][0]=x` → `{ a: { b: ['x'] } }`: los parámetros de una petición, como objeto. */
export function desdeFormulario(params: URLSearchParams | string): Record<string, unknown> {
  const raiz: Record<string, unknown> = {};
  for (const [clave, valor] of new URLSearchParams(params)) {
    const partes = clave.replace(/\]/g, '').split('[');
    let nodo: Record<string, unknown> = raiz;
    partes.forEach((p, i) => {
      if (i === partes.length - 1) { nodo[p] = valor; return; }
      nodo[p] ??= /^\d+$/.test(partes[i + 1]) ? [] : {};
      nodo = nodo[p] as Record<string, unknown>;
    });
  }
  return raiz;
}

const NUMERICOS = new Set(['amount', 'application_fee_amount', 'expires_at', 'unit_amount', 'quantity']);
function aNumeros(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(aNumeros);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, NUMERICOS.has(k) && typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : aNumeros(x)]));
  }
  return v;
}

/** Los parámetros de una petición apuntada, como objeto (los números, como números). */
export function parametrosDe(p: PeticionStripe): Record<string, unknown> {
  return aNumeros(desdeFormulario(p.cuerpo)) as Record<string, unknown>;
}

/**
 * Lo que haría Stripe y stripe-mock no hace: al CREAR, el objeto devuelto lleva lo
 * que se pidió (metadata, importe, modo…). Solo se copian los campos que el objeto
 * tiene con el mismo nombre, y solo sobre peticiones ya validadas.
 */
export function ecoAlCrear(...rutas: string[]): void {
  retocar((p, j) => {
    if (p.metodo !== 'POST' || !rutas.includes(p.ruta)) return undefined;
    const pedido = aNumeros(desdeFormulario(p.params)) as Record<string, unknown>;
    const comunes = Object.fromEntries(Object.entries(pedido).filter(([k]) => k in j && k !== 'id'));
    return { ...j, ...comunes };
  });
}

/** Las peticiones apuntadas a una ruta (`POST /v1/refunds`). */
export function peticiones(metodo: string, ruta: string | RegExp): PeticionStripe[] {
  return estado().peticiones.filter(p => p.metodo === metodo && (typeof ruta === 'string' ? p.ruta === ruta : ruta.test(p.ruta)));
}

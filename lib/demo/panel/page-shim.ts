// Un «Page» de Playwright de mentira, que vive en el navegador de quien mira la demo.
//
// Por qué existe: el andamiaje que ya pinta el panel REAL con un estudio de ejemplo
// (e2e/panel-sembrado.ts, el mismo del vídeo de Configuración) está escrito contra
// `page.route(...)`. En vez de reescribir sus 560 líneas de datos, esto le da el
// único `page` que necesita: `route` y `addInitScript`. Las peticiones del panel se
// atienden aquí, en memoria; NADA sale hacia Supabase ni hacia el servidor.
//
// ⚠️ AISLAMIENTO, y por qué es lo importante de este fichero:
//   · Toda petición a la base de datos real (el host de NEXT_PUBLIC_SUPABASE_URL) que
//     ninguna regla atienda se CONTESTA aquí con vacío: nunca llega a la red.
//   · Toda escritura (POST/PATCH/PUT/DELETE) a `/rest/v1/` o `/api/` se contesta
//     aquí con éxito y no se envía a ninguna parte.
//   · El WebSocket de tiempo real hacia ese host es un falso que nunca conecta.
//   · La sesión es un token de mentira (`t`): aunque saliera una petición, no
//     autentica a nadie.

export interface PeticionShim {
  url(): string;
  method(): string;
  postData(): string | null;
  postDataJSON(): unknown;
  headers(): Record<string, string>;
}
export interface RespuestaShim { status?: number; contentType?: string; headers?: Record<string, string>; body?: string; json?: unknown }
export interface RutaShim {
  request(): PeticionShim;
  fulfill(r: RespuestaShim): Promise<void>;
  fallback(): Promise<void>;
  continue(): Promise<void>;
  abort(): Promise<void>;
}
type Casador = string | RegExp | ((u: URL) => boolean);
type Manejador = (ruta: RutaShim) => unknown;
interface Regla { casa: (u: URL, completa: string) => boolean; manejador: Manejador }

/** Glob de Playwright: `**` cualquier cosa, `*` cualquier cosa menos `/`. */
export function globARegex(glob: string): RegExp {
  const parte = glob.split('**').map((t) => t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '.')).join('.*');
  return new RegExp(`^${parte}$`);
}

function crearCasa(m: Casador): Regla['casa'] {
  if (typeof m === 'function') return (u) => m(u);
  if (m instanceof RegExp) return (_u, c) => m.test(c);
  const re = globARegex(m);
  return (_u, c) => re.test(c);
}

export interface PaginaShim {
  route(m: Casador, h: Manejador): Promise<void>;
  addInitScript<A>(fn: (arg: A) => void, arg: A): Promise<void>;
  /** Para el aislamiento: lo que ninguna regla atendió. */
  sinAtender(): string[];
}

export function crearPagina(opciones: { supabaseHost: string; claveSesion: string; sesion: unknown }): PaginaShim {
  const reglas: Regla[] = [];
  const sinAtender: string[] = [];
  const fetchReal = window.fetch.bind(window);

  const esMutacion = (m: string) => !['GET', 'HEAD', 'OPTIONS'].includes(m.toUpperCase());

  async function atender(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = new Request(entrada as RequestInfo, init);
    const url = new URL(req.url, window.location.href);
    const completa = url.toString();
    const delSupabase = url.host === opciones.supabaseHost;
    const propia = url.origin === window.location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/rest/'));
    if (!delSupabase && !propia) return fetchReal(entrada as RequestInfo, init);

    const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? null : await req.clone().text().catch(() => null);
    const peticion: PeticionShim = {
      url: () => completa, method: () => req.method, postData: () => cuerpo,
      postDataJSON: () => { try { return cuerpo ? JSON.parse(cuerpo) : null; } catch { return null; } },
      headers: () => Object.fromEntries(req.headers.entries()),
    };
    // De la última regla registrada a la primera, como Playwright: `fallback()` baja a la siguiente.
    for (let i = reglas.length - 1; i >= 0; i--) {
      if (!reglas[i].casa(url, completa)) continue;
      const resultado = await new Promise<Response | 'siguiente'>((resolver) => {
        const ruta: RutaShim = {
          request: () => peticion,
          fulfill: async (r) => {
            const cuerpoRespuesta = r.json !== undefined ? JSON.stringify(r.json) : (r.body ?? '');
            const cabeceras = { ...(r.headers ?? {}), ...(r.contentType ? { 'content-type': r.contentType } : {}) };
            const status = r.status ?? 200;
            // Una respuesta sin cuerpo no admite cuerpo (204, 205, 304).
            resolver(new Response([204, 205, 304].includes(status) ? null : cuerpoRespuesta, { status, headers: cabeceras }));
          },
          fallback: async () => resolver('siguiente'),
          continue: async () => resolver('siguiente'),
          abort: async () => resolver(new Response(null, { status: 599 })),
        };
        // Una regla que revienta (síncrona o no) no rompe el panel ni deja pasar nada a la red: se baja a la siguiente.
        try { Promise.resolve(reglas[i].manejador(ruta)).catch(() => resolver('siguiente')); } catch { resolver('siguiente'); }
      });
      if (resultado !== 'siguiente') return resultado;
    }
    // Nadie lo atendió. NUNCA se manda: se contesta aquí.
    sinAtender.push(`${req.method} ${url.pathname}`);
    if (esMutacion(req.method)) return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify(url.pathname.startsWith('/rest/v1/') ? [] : {}), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  window.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => atender(entrada, init)) as typeof window.fetch;

  // El tiempo real hacia la base de datos real no se abre jamás.
  const WebSocketReal = window.WebSocket;
  class WebSocketFalso extends EventTarget {
    readyState = 3; url: string; protocol = ''; extensions = ''; bufferedAmount = 0; binaryType = 'blob';
    onopen = null; onclose = null; onerror = null; onmessage = null;
    constructor(url: string | URL) { super(); this.url = String(url); }
    send() { /* nada */ } close() { /* nada */ }
  }
  window.WebSocket = new Proxy(WebSocketReal, {
    construct(objetivo, args: [string | URL, (string | string[])?]) {
      try { if (new URL(String(args[0])).host === opciones.supabaseHost) return new WebSocketFalso(args[0]) as unknown as WebSocket; } catch { /* url rara: pasa */ }
      return Reflect.construct(objetivo, args);
    },
  });

  // La sesión de mentira, antes de que la app arranque.
  try { localStorage.setItem(opciones.claveSesion, JSON.stringify(opciones.sesion)); } catch { /* sin almacenamiento: el panel pedirá entrar */ }

  return {
    async route(m, h) { reglas.push({ casa: crearCasa(m), manejador: h }); },
    async addInitScript(fn, arg) { fn(arg); },
    sinAtender: () => [...new Set(sinAtender)],
  };
}

import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Un «Supabase» de mentira CON ESTADO, para que el vídeo enseñe lo que pasa de
// verdad al pulsar «Guardar»: la fila cambia y la pantalla lo cuenta.
//
// El andamiaje de e2e (`e2e/panel-sembrado.ts`) contesta siempre lo mismo, y un
// vídeo donde guardas el nombre y la fila sigue diciendo el de antes no enseña
// nada. Aquí cada tabla que se siembra vive en memoria: GET filtra, POST añade,
// PATCH mezcla y DELETE quita. Lo que no se siembra cae al andamiaje de e2e.
//
// Nada de esto llega a una base de datos: el servidor de desarrollo arranca con
// Supabase de mentira (`https://example.supabase.co`) y estas rutas son
// `page.route` de Playwright.
// ─────────────────────────────────────────────────────────────────────────────

export type Fila = Record<string, unknown>;
export type Tablas = Record<string, Fila[]>;

export interface PeticionEscritura { metodo: string; tabla: string; cuerpo: unknown }

export interface Backend {
  tablas: Tablas;
  /** Lo que la pantalla ha escrito (para que el guion pueda comprobar que SÍ se guardó). */
  escrituras: PeticionEscritura[];
}

const json = (route: Route, cuerpo: unknown, status = 200, cabeceras: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers: cabeceras, body: JSON.stringify(cuerpo) });

/** `col=eq.valor`, `col=in.(a,b)`, `col=is.null`, `col=neq.valor`: lo que usa la app. */
function cumple(fila: Fila, params: URLSearchParams): boolean {
  for (const [col, cond] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(col)) continue;
    const v = fila[col];
    if (cond.startsWith('eq.')) { if (String(v) !== cond.slice(3)) return false; }
    else if (cond.startsWith('neq.')) { if (String(v) === cond.slice(4)) return false; }
    else if (cond.startsWith('in.(')) {
      const lista = cond.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''));
      if (!lista.includes(String(v))) return false;
    } else if (cond === 'is.null') { if (v !== null && v !== undefined) return false; }
    else if (cond === 'not.is.null') { if (v === null || v === undefined) return false; }
  }
  return true;
}

let contador = 0;

export async function montarBackend(page: Page, inicial: Tablas): Promise<Backend> {
  // Por referencia, no copiada: las tablas son de TODA la grabación y lo que guarda un
  // capítulo lo ven los siguientes (el estudio va quedando configurado de verdad).
  const backend: Backend = { tablas: inicial, escrituras: [] };

  await page.route(u => u.pathname.startsWith('/rest/v1/') && !u.pathname.startsWith('/rest/v1/rpc/'), async route => {
    const req = route.request();
    const url = new URL(req.url());
    const tabla = decodeURIComponent(url.pathname.split('/rest/v1/')[1] ?? '').split('/')[0];
    if (!(tabla in backend.tablas)) return route.fallback();
    const filas = backend.tablas[tabla];
    const metodo = req.method();
    const quiereObjeto = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const devuelve = (req.headers()['prefer'] ?? '').includes('return=representation');

    if (metodo === 'GET' || metodo === 'HEAD') {
      let res = filas.filter(f => cumple(f, url.searchParams));
      const lim = Number(url.searchParams.get('limit'));
      if (lim > 0) res = res.slice(0, lim);
      const cabeceras = { 'content-range': `0-${Math.max(res.length - 1, 0)}/${res.length}` };
      if (quiereObjeto) {
        return res.length ? json(route, res[0], 200, cabeceras) : json(route, { code: 'PGRST116', message: 'sin filas' }, 406);
      }
      return json(route, res, 200, cabeceras);
    }

    const cuerpo = req.postDataJSON() as Fila | Fila[] | null;
    backend.escrituras.push({ metodo, tabla, cuerpo });

    if (metodo === 'POST') {
      const entrantes = Array.isArray(cuerpo) ? cuerpo : [cuerpo ?? {}];
      const salida: Fila[] = [];
      for (const e of entrantes) {
        const conflicto = url.searchParams.get('on_conflict');
        const claves = conflicto ? conflicto.split(',') : e.id !== undefined ? ['id'] : [];
        const existente = claves.length ? filas.find(f => claves.every(c => String(f[c]) === String(e[c]))) : undefined;
        if (existente) { Object.assign(existente, e); salida.push(existente); }
        else { const nueva = { id: `${tabla}-demo-${++contador}`, ...e }; filas.push(nueva); salida.push(nueva); }
      }
      return devuelve ? json(route, quiereObjeto ? salida[0] : salida, 201) : route.fulfill({ status: 201, body: '' });
    }

    if (metodo === 'PATCH') {
      const tocadas = filas.filter(f => cumple(f, url.searchParams));
      for (const f of tocadas) Object.assign(f, cuerpo);
      return devuelve ? json(route, quiereObjeto ? tocadas[0] : tocadas) : route.fulfill({ status: 204, body: '' });
    }

    if (metodo === 'DELETE') {
      backend.tablas[tabla] = filas.filter(f => !cumple(f, url.searchParams));
      return route.fulfill({ status: 204, body: '' });
    }

    return route.fallback();
  });

  return backend;
}

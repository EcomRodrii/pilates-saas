// ¿Deja una web que se la enseñe dentro de otra? (la vista previa de «Tu web» v2
// con la web REAL del estudio detrás del widget).
//
// Puro (sin red ni React) para `node --test`. Lo decide lo que la propia web
// dice en sus cabeceras de respuesta, igual que lo haría el navegador de quien
// la mira:
//  · `X-Frame-Options`: si la manda, no (`DENY` y `SAMEORIGIN` no nos dejan;
//    `ALLOW-FROM` no lo entiende ningún navegador de hoy, así que no cuenta
//    como permiso; un valor desconocido, por prudencia, tampoco).
//  · `Content-Security-Policy: frame-ancestors`: `'none'` no; `'self'` solo deja
//    a la propia web (no a nosotros); una lista, solo si nombra NUESTRO origen
//    (o `*`). Si una web manda varias políticas, mandan todas: cada una tiene
//    que dejarnos.
// Si manda las dos, mandan las dos (el navegador también las aplica a la vez).
// Cualquier cosa que no se pueda leer con certeza cuenta como «no».

/** Lo que se decide, en categorías que la pantalla puede explicar sin jerga. */
export type DecisionMarco =
  | { ok: true }
  | { ok: false; motivo: 'x-frame-options' | 'frame-ancestors' | 'respuesta' };

/** Las cabeceras de una respuesta, con los nombres en minúscula (como las da `node:http`). */
export type Cabeceras = Readonly<Record<string, string | string[] | undefined>>;

function valores(c: Cabeceras, nombre: string): string[] {
  const v = c[nombre];
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map(x => x.trim()).filter(Boolean);
}

/** Parte `a, b` (políticas) y `x; y` (directivas) respetando que las fuentes no llevan ni coma ni punto y coma. */
function politicas(valor: string): string[][] {
  return valor.split(',').map(p => p.split(';').map(d => d.trim()).filter(Boolean));
}

/** ¿Casa una fuente de `frame-ancestors` con nuestro origen? (`https://x.com`, `*.x.com`, `*`, `https:`) */
function fuenteCasa(fuente: string, origen: URL): boolean {
  const f = fuente.toLowerCase();
  if (f === '*') return true;
  if (f === "'none'" || f === "'self'") return false;
  if (f.startsWith("'")) return false;
  // Un esquema a secas (`https:`).
  if (/^[a-z][a-z0-9+.-]*:$/.test(f)) return f === origen.protocol;
  // [esquema://]host[:puerto] con `*.` opcional. Sin esquema, vale el de la propia web (https): el nuestro también.
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([a-z0-9.-]+|\*)(?::(\d+|\*))?$/.exec(f);
  if (!m) return false;
  const [, esquema, comodin, host, puerto] = m;
  if (esquema && `${esquema}:` !== origen.protocol) return false;
  if (host === '*') return true;
  const nuestro = origen.hostname.toLowerCase();
  const casaHost = comodin ? nuestro.endsWith(`.${host}`) : nuestro === host;
  if (!casaHost) return false;
  if (puerto && puerto !== '*') return puerto === (origen.port || (origen.protocol === 'https:' ? '443' : '80'));
  // Sin puerto: solo el estándar del esquema.
  return !origen.port || origen.port === (origen.protocol === 'https:' ? '443' : '80');
}

/** ¿Nos deja UNA política CSP (sus directivas)? Sin `frame-ancestors`, no dice nada: deja. */
function politicaDeja(directivas: readonly string[], origen: URL): boolean {
  const d = directivas.find(x => x.toLowerCase().startsWith('frame-ancestors'));
  if (!d) return true;
  const fuentes = d.split(/\s+/).slice(1);
  if (fuentes.length === 0) return false;
  if (fuentes.some(f => f.toLowerCase() === "'none'")) return false;
  return fuentes.some(f => fuenteCasa(f, origen));
}

/**
 * Lo que dice una respuesta. `nuestroOrigen` es de dónde se enmarcaría
 * (el del panel que mira, `req.nextUrl.origin`): un `frame-ancestors` que no lo nombre no nos deja.
 * Solo una respuesta 2xx se evalúa: lo demás es «no se sabe» (`respuesta`).
 */
export function decidirEnmarcable(x: { estadoHttp: number; cabeceras: Cabeceras; nuestroOrigen: string }): DecisionMarco {
  if (x.estadoHttp < 200 || x.estadoHttp > 299) return { ok: false, motivo: 'respuesta' };
  let origen: URL;
  try { origen = new URL(x.nuestroOrigen); } catch { return { ok: false, motivo: 'respuesta' }; }

  // `X-Frame-Options` solo sabe RESTRINGIR (DENY, SAMEORIGIN, ALLOW-FROM): si está, no. Un valor que no es ninguno
  // de esos (`ALLOWALL`, una errata) los navegadores lo ignoran; aquí, por prudencia, también cuenta como «no»: no
  // se promete enseñar una web cuya cabecera no se entiende.
  if (valores(x.cabeceras, 'x-frame-options').length > 0) return { ok: false, motivo: 'x-frame-options' };

  const csp = valores(x.cabeceras, 'content-security-policy');
  for (const cabecera of csp) {
    for (const politica of politicas(cabecera)) {
      if (!politicaDeja(politica, origen)) return { ok: false, motivo: 'frame-ancestors' };
    }
  }
  return { ok: true };
}

/** `x.com` y `www.x.com` son el MISMO sitio. Devuelve las dos formas (la dada primero). */
export function variantesDeHost(host: string): string[] {
  const h = host.toLowerCase().replace(/\.$/, '');
  const otra = h.startsWith('www.') ? h.slice(4) : `www.${h}`;
  return [h, otra];
}

/** ¿Es `b` el mismo sitio que `a`? (el mismo host con o sin `www.`) */
export function mismoSitio(a: string, b: string): boolean {
  return variantesDeHost(a).includes(b.toLowerCase().replace(/\.$/, ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// «No volver a pedir el código en este dispositivo» (3-oct-2026, decisión del
// fundador): 30 días desde la última vez que se usa ese navegador.
//
// Cómo funciona:
//   1. Tras escribir el código (sesión `aal2`), si la casilla está marcada, el
//      servidor crea un dispositivo y deja en el navegador una cookie HttpOnly
//      con un token aleatorio. En la base de datos solo queda su hash.
//   2. En el siguiente login la sesión nace en `aal1`. Antes de entrar al panel,
//      el navegador presenta la cookie (/api/auth/dispositivo-confianza/usar) y,
//      si el dispositivo es de esa cuenta y no ha caducado, el servidor apunta
//      esa sesión (`session_id` del JWT) como confiada.
//   3. La base de datos (`sesion_de_confianza()`, migr 20261003110108) y
//      `verificarSesionStaff` tratan una sesión confiada como si hubiera pasado
//      el segundo paso.
//
// Lo que NO hace: ni la IP ni el «dispositivo» identifican a nadie (la IP
// cambia con la wifi o los datos del móvil, y un navegador no puede leer el
// identificador del hardware). La llave es la cookie; IP y nombre se guardan
// para que la persona vea desde dónde se entra y quite lo que no reconozca.
//
// Fuera a propósito: la zona interna (/interno) sigue pidiendo el código, y
// todo lo que Supabase protege por su cuenta (quitar o añadir un factor) exige
// escribirlo de verdad.
//
// Puro, sin imports de Next ni de `@/`, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

export const DIAS_DISPOSITIVO_CONFIANZA = 30;

/** Cuántos dispositivos recordados puede tener una cuenta a la vez. */
export const MAX_DISPOSITIVOS_POR_CUENTA = 10;

/**
 * La cookie lleva el nombre de la CUENTA (una huella de su id, no el id): en
 * el iPad de recepción entran varias personas, y con un nombre único la que
 * recordara el dispositivo después le borraría el suyo a la anterior.
 */
export const PREFIJO_COOKIE_DISPOSITIVO = 'tentare_disp_';

export function nombreCookieDispositivo(huellaCuenta: string): string {
  return `${PREFIJO_COOKIE_DISPOSITIVO}${huellaCuenta}`;
}

/** La cookie solo viaja a estas rutas: el resto del sitio no la ve. */
export const RUTA_COOKIE_DISPOSITIVO = '/api/auth/dispositivo-confianza';

const DIA_MS = 24 * 60 * 60 * 1000;

export function caducidadDesde(ahora: Date): Date {
  return new Date(ahora.getTime() + DIAS_DISPOSITIVO_CONFIANZA * DIA_MS);
}

/** 32 bytes en base64url, que es lo que genera el servidor. */
export function formatoTokenValido(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El `session_id` del access token de Supabase.
 *
 * ⚠️ No verifica la firma: solo vale para un token que ya ha pasado por
 * `supabase.auth.getUser(token)`, igual que `nivelAutenticacion`
 * (lib/interno/mfa.ts). Con un token sin validar sería creer lo que escribe el
 * cliente.
 */
export function sesionDelToken(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  const partes = accessToken.split('.');
  if (partes.length !== 3 || !partes[1]) return null;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const relleno = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(relleno), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { session_id?: unknown };
    return typeof payload.session_id === 'string' && UUID.test(payload.session_id) ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** El valor de una cookie en la cabecera `Cookie`. */
export function leerCookie(cabecera: string | null | undefined, nombre: string): string | null {
  if (!cabecera) return null;
  for (const trozo of cabecera.split(';')) {
    const i = trozo.indexOf('=');
    if (i === -1) continue;
    if (trozo.slice(0, i).trim() === nombre) return trozo.slice(i + 1).trim() || null;
  }
  return null;
}

/**
 * `Set-Cookie` del dispositivo. HttpOnly (el JavaScript de la página no la
 * lee), SameSite=Strict (solo la manda el propio panel) y acotada a las rutas
 * del dispositivo. `Secure` siempre que la petición llegue por https; en local
 * por http no se podría guardar.
 */
export function cabeceraCookieDispositivo(nombre: string, token: string, opciones: { segura: boolean }): string {
  return [
    `${nombre}=${token}`,
    `Path=${RUTA_COOKIE_DISPOSITIVO}`,
    `Max-Age=${DIAS_DISPOSITIVO_CONFIANZA * 24 * 60 * 60}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(opciones.segura ? ['Secure'] : []),
  ].join('; ');
}

export function cabeceraCookieBorrada(nombre: string, opciones: { segura: boolean }): string {
  return [
    `${nombre}=`,
    `Path=${RUTA_COOKIE_DISPOSITIVO}`,
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict',
    ...(opciones.segura ? ['Secure'] : []),
  ].join('; ');
}

/**
 * Un nombre que la persona reconozca en la lista («iPad · Safari»). Solo es
 * una etiqueta: no identifica nada. Un iPad moderno se presenta como Mac en el
 * user agent; `tactil` (lo manda la propia página) lo distingue.
 */
export function nombreDispositivo(userAgent: string | null | undefined, tactil = false): string {
  const ua = userAgent ?? '';
  let sistema = 'Ordenador';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && tactil)) sistema = 'iPad';
  else if (/iPhone|iPod/.test(ua)) sistema = 'iPhone';
  else if (/Android/.test(ua)) sistema = /Mobile/.test(ua) ? 'Móvil Android' : 'Tablet Android';
  else if (/Macintosh|Mac OS X/.test(ua)) sistema = 'Mac';
  else if (/Windows/.test(ua)) sistema = 'Windows';
  else if (/CrOS/.test(ua)) sistema = 'Chromebook';
  else if (/Linux/.test(ua)) sistema = 'Linux';

  let navegador: string | null = null;
  if (/Edg(e|A|iOS)?\//.test(ua)) navegador = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) navegador = 'Opera';
  else if (/SamsungBrowser\//.test(ua)) navegador = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(ua)) navegador = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) navegador = 'Chrome';
  else if (/Safari\//.test(ua)) navegador = 'Safari';

  return navegador ? `${sistema} · ${navegador}` : sistema;
}

/** Una IP para enseñar, no para decidir. `unknown` (sin cabeceras de proxy) no se guarda. */
export function ipParaGuardar(ip: string | null | undefined): string | null {
  const limpia = (ip ?? '').trim();
  if (!limpia || limpia === 'unknown') return null;
  return limpia.slice(0, 64);
}

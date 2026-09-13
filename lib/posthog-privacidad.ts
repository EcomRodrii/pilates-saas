// ─────────────────────────────────────────────────────────────────────────────
// Qué puede salir hacia PostHog y desde dónde — lógica pura, sin SDK ni
// navegador, para que `posthog-privacidad.test.ts` pruebe EL MISMO código que
// corre en producción (mismo criterio que `lib/sentry-cola.ts`).
//
// Dos puertas, y hacen falta las dos:
//
//   1. DÓNDE se carga (`rutaExcluidaDeAnalitica`, `esVistaIncrustada`): la app
//      tiene UN solo root layout del que cuelgan la landing, el panel, la app
//      de la alumna, la página y el widget de reservas (también dentro de la
//      web de cada estudio), el backoffice y las pantallas de acceso. PostHog
//      mide la web pública y el panel del PERSONAL; nada de lo demás.
//
//   2. QUÉ sale de cada evento (`sanearEventoPosthog`, el `before_send`): la
//      puerta 1 decide dónde ARRANCA el SDK, no dónde sigue. Una navegación
//      blanda desde la landing a `/portal/...` no recarga la página, y un
//      `$referrer` o un `$prev_pageview_pathname` pueden traer la URL de una
//      ruta excluida aunque el evento se capture en una permitida. Por eso el
//      filtro de eventos vuelve a mirar la ruta y sanea TODAS las propiedades
//      con URL: sin fragmento (ahí vuelve la sesión de Supabase tras un enlace
//      mágico u OAuth), sin query salvo `utm_*`, y con los ids de la ruta
//      reducidos a `:id`.
// ─────────────────────────────────────────────────────────────────────────────
import type { CaptureResult } from 'posthog-js';

/**
 * Prefijos donde PostHog no se carga ni captura nada. Coincidencia por
 * SEGMENTO completo: `/interno` excluye `/interno/estudios/x`, no `/internos`.
 */
export const PREFIJOS_EXCLUIDOS_DE_ANALITICA = [
  // App de la alumna (marca blanca del estudio) y su vista previa.
  '/portal', '/portal-preview',
  // Reserva pública del estudio — también se sirve incrustada en su web —, el
  // enlace público de instructora freelance (reexporta /reservar) y el puente
  // del enlace mágico del widget.
  '/reservar', '/i', '/widget-auth-retorno',
  // Enlaces firmados: el token va EN LA RUTA.
  '/confirmar-reserva', '/valorar', '/aceptar-sustitucion', '/no-puedo', '/disponibilidad',
  '/network/referencia',
  // Tentare Network del lado de la alumna.
  '/network/alumna',
  // Acceso: retornos con la sesión en el fragmento, invitaciones con token.
  '/login', '/clave-nueva', '/invitacion', '/oauth', '/network/acceso',
  // Backoffice de Tentare, temas publicados (origen del estudio) y kiosko.
  '/interno', '/tema-publicado', '/kiosk',
] as const;

/** Parámetros de query que sobreviven al saneado. Todo lo demás se cae. */
const PARAMETROS_PERMITIDOS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);

/**
 * Eventos que no se envían nunca: todos llevan texto o estructura del DOM
 * (lo que se pulsó, dónde) o el mensaje de un error, y cualquiera de las dos
 * cosas puede ser el nombre o el correo de una persona. Se apagan también en
 * `init`; esto es la red por si la configuración remota del proyecto los
 * vuelve a encender.
 */
const EVENTOS_DESCARTADOS = new Set([
  '$autocapture', '$copy_autocapture', '$rageclick', '$dead_click', '$heatmap', '$$heatmap', '$exception',
]);

/** Propiedades con una URL o una ruta dentro. */
const PROPIEDADES_URL = new Set([
  '$current_url', '$pathname', '$referrer', '$prev_pageview_pathname', '$external_click_url',
  '$initial_current_url', '$initial_pathname', '$initial_referrer',
  '$session_entry_url', '$session_entry_pathname', '$session_entry_referrer',
]);

/** Propiedades con texto o estructura del DOM. */
const PROPIEDADES_DOM = new Set(['$el_text', '$elements', '$elements_chain']);

/**
 * Identificadores de clic de anuncios que el SDK guarda como propiedad (y en
 * sus variantes `$initial_*` / `$session_entry_*`). Identifican a una persona
 * concreta en la red del anunciante — no son una campaña.
 */
const IDS_DE_CLIC = new Set([
  'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'twclid', 'li_fat_id',
  'igshid', 'ttclid', 'rdt_cid', 'epik', 'qclid', 'sccid', 'irclid', '_kx', 'mc_eid',
]);

const BASE_RELATIVA = 'http://ruta-relativa.invalid';
const RE_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i;

function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

function prefijoExcluido(pathname: unknown): string | null {
  if (typeof pathname !== 'string') return null;
  let ruta = decodificar(pathname.trim()).toLowerCase();
  const corte = ruta.search(/[?#]/);
  if (corte !== -1) ruta = ruta.slice(0, corte);
  ruta = `/${ruta}`.replace(/\/{2,}/g, '/');
  for (const prefijo of PREFIJOS_EXCLUIDOS_DE_ANALITICA) {
    if (ruta === prefijo || ruta.startsWith(`${prefijo}/`)) return prefijo;
  }
  return null;
}

/** ¿PostHog tiene prohibido cargar o capturar en esta ruta? */
export function rutaExcluidaDeAnalitica(pathname: string): boolean {
  return prefijoExcluido(pathname) !== null;
}

type VentanaMinima = { self: unknown; top: unknown; location: { search: string } };

/**
 * ¿Esta vista va incrustada en la web de otro (iframe o `?embed=1`)? Ahí quien
 * navega es visitante del estudio, no de Tentare. Gemela de la privada de
 * `lib/ahrefs-cliente.ts`; se miran las dos señales porque cualquiera puede
 * faltar (el parámetro se pierde al navegar dentro del widget).
 */
export function esVistaIncrustada(
  ventana: VentanaMinima | undefined = (globalThis as { window?: VentanaMinima }).window,
): boolean {
  if (!ventana) return false;
  try {
    if (ventana.self !== ventana.top) return true;
  } catch {
    return true; // leer `top` solo falla dentro de un iframe de otro origen
  }
  return new URLSearchParams(ventana.location.search).get('embed') === '1';
}

/** ¿Puede cargarse PostHog en esta vista? Público para probarlo sin navegador. */
export function debeCargarseAnalitica(pathname: string, incrustada: boolean): boolean {
  return !incrustada && !rutaExcluidaDeAnalitica(pathname);
}

// uid() de lib/utils.ts: `<Date.now() en base 36, 8 car.>-<contador>-<azar ≤5>`,
// casi siempre con prefijo de entidad (`soc-`, `ins-`, `ses-`, `rec-`...).
// La primera letra del timestamp va de `k` (2020) a `z` (~2059).
const RE_UID_CON_PREFIJO = /^[a-z]{2,8}-[k-z][0-9a-z]{7}-[0-9a-z]{1,7}-[0-9a-z]{1,6}$/;
const RE_UID_SIN_PREFIJO = /^[k-z][0-9a-z]{7}-[0-9a-z]{1,7}-[0-9a-z]{1,6}$/;
const RE_UUID = /^(?:[a-z]{1,8}[-_])?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Ids cortos con prefijo de entidad y algún dígito: `soc-1`, `ins-2a`.
const RE_ID_CORTO = /^[a-z]{2,5}-[0-9a-z-]*\d[0-9a-z-]*$/;

/**
 * ¿Este segmento de ruta identifica algo (una socia, un recibo, un token)? Los
 * slugs legibles de la web pública van en minúsculas, sin dígitos, puntos ni
 * guiones bajos; un slug con dígitos puede acabar como `:id`, y eso solo cuesta
 * granularidad, nunca privacidad.
 */
function pareceIdentificador(segmento: string): boolean {
  const s = decodificar(segmento);
  if (s.includes('@')) return true;
  if (/^\d+$/.test(s) || RE_UUID.test(s)) return true;
  if (RE_UID_CON_PREFIJO.test(s) || RE_ID_CORTO.test(s)) return true;
  if (RE_UID_SIN_PREFIJO.test(s) && /\d/.test(s)) return true;
  // Tokens firmados (`payload.firma` en base64url) y hashes.
  return s.length >= 16 && /[0-9A-Z._~=+]/.test(s);
}

function sanearRuta(pathname: string): string {
  // Una ruta excluida se reduce a su prefijo: `/valorar/<token>` que llega como
  // `$referrer` de la landing se queda en `/valorar`.
  const prefijo = prefijoExcluido(pathname);
  if (prefijo) return prefijo;
  const ruta = pathname
    .split('/')
    .map((segmento) => (segmento && pareceIdentificador(segmento) ? ':id' : segmento))
    .join('/');
  return ruta.startsWith('/') ? ruta : `/${ruta}`;
}

/** Para lo que `new URL` no sabe leer: se corta en `?`/`#` y se sanea la ruta. */
function sanearUrlIlegible(entrada: string): string {
  const corte = entrada.search(/[?#]/);
  const sinConsulta = corte === -1 ? entrada : entrada.slice(0, corte);
  const partes = /^([a-z][a-z0-9+.-]*:\/\/)([^/]*)(.*)$/i.exec(sinConsulta);
  if (partes) {
    const host = partes[2].slice(partes[2].lastIndexOf('@') + 1); // fuera credenciales
    return `${partes[1]}${host}${sanearRuta(partes[3])}`;
  }
  return sanearRuta(sinConsulta);
}

/**
 * URL apta para analítica: sin fragmento, sin credenciales, sin más query que
 * `utm_*` y con los ids de la ruta como `:id`. Acepta absolutas y relativas;
 * con una entrada ilegible nunca devuelve lo que venía detrás de `?` o `#`.
 */
export function sanearUrl(url: string): string {
  if (typeof url !== 'string') return '';
  const entrada = url.trim();
  // `$direct` es el valor que pone el SDK en `$referrer` cuando no hay referrer.
  if (entrada === '' || entrada === '$direct') return entrada;
  const absoluta = RE_ESQUEMA.test(entrada);
  let analizada: URL;
  try {
    analizada = absoluta ? new URL(entrada) : new URL(entrada, BASE_RELATIVA);
  } catch {
    return sanearUrlIlegible(entrada);
  }
  const consulta = new URLSearchParams();
  for (const [clave, valor] of analizada.searchParams) {
    if (PARAMETROS_PERMITIDOS.has(clave) && !valor.includes('@')) consulta.append(clave, valor);
  }
  const query = consulta.toString();
  const origen = !absoluta ? '' : analizada.host ? `${analizada.protocol}//${analizada.host}` : analizada.protocol;
  return `${origen}${sanearRuta(analizada.pathname)}${query ? `?${query}` : ''}`;
}

function rutaDe(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const entrada = valor.trim();
  try {
    return (RE_ESQUEMA.test(entrada) ? new URL(entrada) : new URL(entrada, BASE_RELATIVA)).pathname;
  } catch {
    const corte = entrada.search(/[?#]/);
    const sinConsulta = corte === -1 ? entrada : entrada.slice(0, corte);
    return sinConsulta.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '') || '/';
  }
}

function esIdDeClic(clave: string): boolean {
  return IDS_DE_CLIC.has(clave.replace(/^\$(?:initial|session_entry)_/, ''));
}

type Propiedades = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Propiedades {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function limpiarPropiedades(propiedades: Propiedades): Propiedades {
  const limpias: Propiedades = {};
  for (const [clave, valor] of Object.entries(propiedades)) {
    if (PROPIEDADES_DOM.has(clave) || esIdDeClic(clave)) continue;
    if (PROPIEDADES_URL.has(clave)) {
      limpias[clave] = typeof valor === 'string' ? sanearUrl(valor) : valor;
    } else if (clave === '$initial_person_info' && esObjeto(valor)) {
      // Forma compacta del SDK: `{ r: referrer, u: url }`.
      limpias[clave] = {
        ...valor,
        ...(typeof valor.r === 'string' ? { r: sanearUrl(valor.r) } : {}),
        ...(typeof valor.u === 'string' ? { u: sanearUrl(valor.u) } : {}),
      };
    } else if ((clave === '$set' || clave === '$set_once') && esObjeto(valor)) {
      limpias[clave] = limpiarPropiedades(valor);
    } else {
      limpias[clave] = valor;
    }
  }
  return limpias;
}

/**
 * `before_send` de PostHog: descarta lo que no debe salir (`null`) y sanea lo
 * demás. Nunca muta el evento recibido.
 */
export function sanearEventoPosthog(evento: CaptureResult | null): CaptureResult | null {
  if (!evento) return null;
  if (EVENTOS_DESCARTADOS.has(String(evento.event))) return null;
  const propiedades: Propiedades = esObjeto(evento.properties) ? evento.properties : {};
  for (const valor of [propiedades.$pathname, propiedades.$current_url]) {
    const ruta = rutaDe(valor);
    if (ruta !== null && rutaExcluidaDeAnalitica(ruta)) return null;
  }
  const saneado: CaptureResult = {
    ...evento,
    properties: limpiarPropiedades(propiedades) as CaptureResult['properties'],
  };
  if (esObjeto(evento.$set)) saneado.$set = limpiarPropiedades(evento.$set) as CaptureResult['$set'];
  if (esObjeto(evento.$set_once)) {
    saneado.$set_once = limpiarPropiedades(evento.$set_once) as CaptureResult['$set_once'];
  }
  return saneado;
}

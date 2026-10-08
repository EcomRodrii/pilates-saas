// ─────────────────────────────────────────────────────────────────────────────
// Meta Pixel — el ENVÍO. Las reglas (dónde, quién, con qué permiso) están en
// meta-pixel-reglas.ts; aquí solo se aplican.
//
// Qué hace y qué NO, a propósito:
//  · No carga nada sin un «sí» guardado, en el host de producción y en una ruta de
//    la lista blanca. Sin eso, todo lo de aquí es un no-op.
//  · `disablePushState`: por defecto fbevents.js parchea `history.pushState` y manda
//    un PageView en cada navegación blanda, también al pasar de la web al panel si
//    alguien lo hiciera sin recarga. Aquí los PageView los decide `seguirRuta`.
//  · `autoConfig = false`: sin él, Meta decide desde su panel qué botones y
//    campos de formulario detectar, y el alta lleva el correo y el nombre del
//    estudio. Tampoco se pasan datos de usuario en `init`.
//  · Retirar el permiso borra `_fbp`/`_fbc` y manda `consent revoke`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CLAVE_DECISION, EVENTO_DECISION, PIXEL_ID,
  codificarDecision, hostConPixel, leerDecision, rutaConPixel,
  type Decision,
} from './meta-pixel-reglas.ts';

type Fbq = ((...args: unknown[]) => void) & {
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
  callMethod?: (...args: unknown[]) => void;
  disablePushState?: boolean;
  allowDuplicatePageViews?: boolean;
};
type VentanaConFbq = Window & { fbq?: Fbq; _fbq?: Fbq };

const enNavegador = typeof window !== 'undefined';
const SRC = 'https://connect.facebook.net/en_US/fbevents.js';

let iniciado = false;
let ultimaRuta: string | null = null;

export function decisionGuardada(): Decision | null {
  if (!enNavegador) return null;
  try {
    return leerDecision(window.localStorage.getItem(CLAVE_DECISION), Date.now());
  } catch {
    return null;
  }
}

function pixelPermitido(): boolean {
  return enNavegador && hostConPixel(window.location.hostname) && decisionGuardada() === 'si';
}

function fbq(): Fbq | undefined {
  return (window as VentanaConFbq).fbq;
}

function iniciar(): void {
  if (iniciado) return;
  iniciado = true;
  const w = window as VentanaConFbq;
  if (!w.fbq) {
    // El stub oficial: guarda las llamadas hasta que fbevents.js carga y las vacía.
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue!.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    w.fbq = n;
    if (!w._fbq) w._fbq = n;
    const s = document.createElement('script');
    s.async = true;
    s.src = SRC;
    document.head.appendChild(s);
  }
  const f = fbq()!;
  f.disablePushState = true;
  f.allowDuplicatePageViews = true;
  f('set', 'autoConfig', false, PIXEL_ID);
  f('init', PIXEL_ID);
}

/**
 * Se llama en cada cambio de ruta y al decidir. Idempotente: no repite el
 * PageView de la misma ruta, y no hace nada fuera de lo permitido.
 */
export function seguirRuta(path: string): void {
  if (!pixelPermitido() || !rutaConPixel(path)) return;
  iniciar();
  if (path === ultimaRuta) return;
  ultimaRuta = path;
  fbq()!('track', 'PageView');
  if (path === '/crear-estudio' || path.startsWith('/crear-estudio/')) {
    fbq()!('track', 'ViewContent', { content_name: 'alta_estudio' });
  }
}

/** El alta del estudio se completó: la conversión que optimiza la campaña. */
export function registrarAltaCompletada(plan: string): void {
  if (!pixelPermitido() || !iniciado) return;
  fbq()!('track', 'CompleteRegistration', { content_name: plan, status: true });
}

function borrarCookiesMeta(): void {
  const dominios = ['', `; domain=${window.location.hostname}`, `; domain=.${window.location.hostname.replace(/^www\./, '')}`];
  for (const nombre of ['_fbp', '_fbc']) {
    for (const d of dominios) document.cookie = `${nombre}=; Max-Age=0; path=/${d}`;
  }
}

/** Guarda el sí/no, lo anuncia a quien esté escuchando y aplica el efecto. */
export function guardarDecision(d: Decision, rutaActual: string): void {
  if (!enNavegador) return;
  try {
    window.localStorage.setItem(CLAVE_DECISION, codificarDecision(d, Date.now()));
  } catch {
    // Sin almacenamiento no hay forma de recordar un sí: se queda en «no».
    d = 'no';
  }
  if (d === 'no') {
    fbq()?.('consent', 'revoke');
    borrarCookiesMeta();
  } else {
    fbq()?.('consent', 'grant');
    seguirRuta(rutaActual);
  }
  window.dispatchEvent(new Event(EVENTO_DECISION));
}

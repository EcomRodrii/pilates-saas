// ─────────────────────────────────────────────────────────────────────────────
// Transiciones de pantalla de la app de la alumna (maqueta aprobada, oct-2026).
//
//   · Abrir una ficha (clase, reserva, bono, pago, QR): entra desde la derecha.
//   · Volver: sale hacia la derecha.
//   · Cambiar de pestaña: fundido corto.
//   · Cualquier otra navegación (redirecciones, el buscador, el gesto de
//     deslizar del iPhone, que ya anima solo): nada.
//
// Se hace con `<ViewTransition>` de React (StudentShell) y los TIPOS de
// transición de Next (`transitionTypes` en <Link> y router.push/replace), igual
// que el panel (lib/panel/transiciones.ts). Solo anima lo que va marcado.
//
// ⚠️ «Volver» con historial es `router.back()`, y esa navegación no admite tipos:
// la hace el navegador (popstate). Por eso, para ESA, el botón deja una marca en
// <html> (`data-vt-volver`) justo antes y el CSS la lee; el gesto de deslizar
// del iPhone no la deja y no se anima dos veces. Ver `marcarVolver`.
//
// Puro salvo `marcarVolver`, que toca el DOM y solo se llama desde un clic.
// ─────────────────────────────────────────────────────────────────────────────

export const TIPO_ADELANTE = 'alumna-adelante';
export const TIPO_ATRAS = 'alumna-atras';
export const TIPO_PESTANA = 'alumna-pestana';

export const TRANSICION_ADELANTE: string[] = [TIPO_ADELANTE];
export const TRANSICION_ATRAS: string[] = [TIPO_ATRAS];
export const TRANSICION_PESTANA: string[] = [TIPO_PESTANA];

/**
 * La `view-transition-class` que lleva el contenido al ENTRAR y al SALIR, según
 * el tipo de la navegación. Distintas para entrar y salir porque el CSS tiene
 * que saber cuál va encima (al abrir, la nueva; al volver, la que se va), y un
 * `::view-transition-group` no distingue la foto vieja de la nueva.
 * `alumna-otra-*` (sin tipo) no anima nada salvo con la marca de «volver».
 */
export const CLASES_ENTRADA = {
  [TIPO_ADELANTE]: 'alumna-adelante-entra',
  [TIPO_ATRAS]: 'alumna-atras-entra',
  [TIPO_PESTANA]: 'alumna-pestana-entra',
  default: 'alumna-otra-entra',
};
export const CLASES_SALIDA = {
  [TIPO_ADELANTE]: 'alumna-adelante-sale',
  [TIPO_ATRAS]: 'alumna-atras-sale',
  [TIPO_PESTANA]: 'alumna-pestana-sale',
  default: 'alumna-otra-sale',
};

/**
 * La pantalla «padre» de una ruta de la app, para «Volver» cuando no hay
 * historial dentro de la app (llegó desde un aviso push o un enlace): quitar el
 * último tramo. `/portal/x/reservar/abc` → `/portal/x/reservar`;
 * `/portal/x/perfil/qr` → `/portal/x/perfil`; una pestaña → Inicio.
 * Nunca sale del estudio: el tope es `/portal/<slug>`.
 */
export function rutaPadre(pathname: string): string {
  const limpio = pathname.split(/[?#]/)[0].replace(/\/+$/, '');
  const partes = limpio.split('/').filter(Boolean);
  // ['portal', slug, ...resto]
  if (partes[0] !== 'portal' || partes.length < 2) return '/';
  const raiz = `/portal/${partes[1]}`;
  const resto = partes.slice(2);
  // Pantallas cuya ruta intermedia no existe como pantalla propia.
  if (resto[0] === 'reservar' && resto[1] === 'confirmacion') return `${raiz}/reservar`;
  if (resto.length <= 1) return raiz;
  return `${raiz}/${resto.slice(0, -1).join('/')}`;
}

/**
 * La pila de rutas que ha visitado ESTA sesión de la app. Solo sirve para saber
 * si «Volver» tiene a dónde volver dentro de la app: `history.length` cuenta
 * también lo de antes de entrar (otra web, el enlace de un correo), y desde un
 * aviso push la app arranca directamente en la ficha.
 *
 * Una ruta igual a la penúltima es una vuelta atrás (botón, gesto o navegador):
 * se desapila. Cualquier otra se apila. Las de acceso (login, código…) vacían la
 * pila. Pura: recibe la pila y devuelve otra.
 */
export function apilarRuta(pila: readonly string[], ruta: string): string[] {
  // Las pantallas de acceso no son historial de la app: tras entrar con el
  // código, «Volver» no puede devolverla al login. Entrar ahí empieza de cero.
  if (/^\/portal\/[^/]+\/acceso(\/|$)/.test(ruta)) return [];
  if (pila[pila.length - 1] === ruta) return [...pila];
  if (pila.length >= 2 && pila[pila.length - 2] === ruta) return pila.slice(0, -1);
  const nueva = [...pila, ruta];
  // Sin crecer para siempre en una sesión larga.
  return nueva.length > 50 ? nueva.slice(-50) : nueva;
}

/**
 * Una navegación con `router.replace` SUSTITUYE la cima: no deja nada detrás.
 * Si se apilara, tras volver a la pantalla padre sin historial la pila creería
 * que hay a dónde volver, y el siguiente «Volver» haría un `history.back()` que
 * no lleva a ningún sitio (o saca de la app).
 */
export function reemplazarCima(pila: readonly string[], ruta: string): string[] {
  return pila.length === 0 ? [ruta] : [...pila.slice(0, -1), ruta];
}

const ATRIBUTO_VOLVER = 'data-vt-volver';

/**
 * Marca en <html> que la navegación que viene es «volver» (ver la cabecera del
 * fichero). Se quita sola: si la navegación no llega a animarse, no puede
 * contagiar a la siguiente.
 */
export function marcarVolver(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.setAttribute(ATRIBUTO_VOLVER, '');
  window.setTimeout(() => html.removeAttribute(ATRIBUTO_VOLVER), 900);
}

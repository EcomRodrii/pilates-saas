// Runtime del método «Popup» de Tentare Widgets → public/widget-popup.js.
//
// La propietaria pega en su web:
//   <button type="button" data-tentare-popup="https://…/reservar/<slug>?embed=1&…"
//           data-tentare-titulo="Horario y reservas" data-tentare-ancho="720">Reservar</button>
//   <script src="https://…/widget-popup.js" async></script>
// y al pulsar el botón se abre el MISMO widget incrustado de siempre
// (`/reservar/[slug]?embed=1`, que reserva y cobra de verdad) en una ventana
// encima de su web. Aquí no hay lógica de negocio: solo la ventana.
//
// Decisiones:
//  - Sin React ni dependencias: esto se descarga en TODAS las páginas de la
//    web del estudio, se abra o no. Pesa lo que pesa este fichero.
//  - Delegación en `document`: un botón que llega tarde (un constructor de
//    páginas, una web hecha con React) funciona sin volver a cargar nada.
//  - Shadow DOM para la ventana: el CSS de la web no la toca, y el nuestro no
//    toca la web.
//  - ⚠️ Solo abre URLs de Tentare (lib/widgets/popup-url.ts).
//  - Accesible: `role="dialog"` + `aria-modal`, foco al abrir y devuelto al
//    botón al cerrar, Esc cierra, el resto de la página queda `inert` mientras
//    tanto y la animación se apaga con `prefers-reduced-motion`.

const ORIGEN = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    // Mismo arreglo que main.tsx: el apex redirige a www y un iframe sí lo
    // sigue, pero el origen de los mensajes sería el de www.
    return canonicalizarOrigen(new URL(src ?? window.location.href).origin);
  } catch {
    return window.location.origin;
  }
})();

import { urlPopupPermitida } from '@/lib/widgets/popup-url';
import { canonicalizarOrigen } from '@/lib/legal-info';

const ANCHO_POR_DEFECTO = 720;
const ALTO_MAXIMO = 860;

const CSS = `
:host { all: initial; }
.fondo { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center;
  padding: 28px 16px 16px; background: rgba(20, 22, 18, .55); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  animation: aparecer .18s ease-out; }
.ventana { position: relative; width: 100%; display: flex; flex-direction: column; animation: subir .22s ease-out; }
.marco { background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.28); }
/* La ✕ va FUERA del widget (esquina de la ventana), no encima de su cabecera. */
.cerrar { position: absolute; top: -14px; right: -14px; z-index: 1; width: 40px; height: 40px; border-radius: 999px; border: 0;
  background: #fff; color: #22261F; font: 600 22px/1 system-ui, sans-serif; cursor: pointer;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
.cerrar:focus-visible { outline: 3px solid #343825; outline-offset: 2px; }
iframe { display: block; width: 100%; border: 0; background: transparent; }
@media (max-width: 640px) {
  .fondo { padding: 56px 0 0; align-items: flex-end; }
  .marco { border-radius: 18px 18px 0 0; }
  .cerrar { top: -48px; right: 12px; }
}
@media (prefers-reduced-motion: reduce) { .fondo, .ventana { animation: none; } }
@keyframes aparecer { from { opacity: 0; } to { opacity: 1; } }
@keyframes subir { from { transform: translateY(12px); opacity: .6; } to { transform: none; opacity: 1; } }
`;

let abierta: (() => void) | null = null;

function abrir(disparador: HTMLElement, url: string) {
  if (abierta) abierta();
  const titulo = disparador.getAttribute('data-tentare-titulo')?.slice(0, 80) || 'Reservas';
  const anchoCrudo = Number(disparador.getAttribute('data-tentare-ancho'));
  const ancho = Number.isFinite(anchoCrudo) && anchoCrudo >= 320 && anchoCrudo <= 1200 ? anchoCrudo : ANCHO_POR_DEFECTO;
  const movil = window.matchMedia('(max-width: 640px)').matches;
  const altoMax = movil ? window.innerHeight - 56 : Math.min(ALTO_MAXIMO, window.innerHeight - 56);

  const host = document.createElement('div');
  host.setAttribute('data-tentare-popup-ventana', '');
  const raiz = host.attachShadow({ mode: 'open' });
  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  const fondo = document.createElement('div');
  fondo.className = 'fondo';
  const ventana = document.createElement('div');
  ventana.className = 'ventana';
  ventana.setAttribute('role', 'dialog');
  ventana.setAttribute('aria-modal', 'true');
  ventana.setAttribute('aria-label', titulo);
  ventana.style.maxWidth = `${ancho}px`;
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.textContent = '×';
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = titulo;
  iframe.allow = 'payment';
  iframe.style.height = `${altoMax}px`;
  const marco = document.createElement('div');
  marco.className = 'marco';
  marco.append(iframe);
  ventana.append(cerrar, marco);
  fondo.append(ventana);
  raiz.append(estilo, fondo);

  // El resto de la página, fuera de juego mientras la ventana está abierta:
  // ni el tabulador ni un lector de pantalla se escapan detrás.
  const apartados: HTMLElement[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el instanceof HTMLElement && !el.inert && el !== host) { el.inert = true; apartados.push(el); }
  }
  const overflowAntes = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  document.body.append(host);

  // La vista incrustada anuncia su alto real: si es más corta que la ventana,
  // la ventana se ajusta; si es más larga, se hace scroll DENTRO.
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== ORIGEN || e.source !== iframe.contentWindow) return;
    const alto = Number(e.data?.tentareEmbedAltura);
    if (alto > 0) iframe.style.height = `${Math.min(alto, altoMax)}px`;
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarVentana(); };
  function cerrarVentana() {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('keydown', onKey, true);
    for (const el of apartados) el.inert = false;
    document.documentElement.style.overflow = overflowAntes;
    host.remove();
    abierta = null;
    disparador.focus({ preventScroll: true });
  }
  abierta = cerrarVentana;
  window.addEventListener('message', onMessage);
  document.addEventListener('keydown', onKey, true);
  cerrar.addEventListener('click', cerrarVentana);
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrarVentana(); });
  cerrar.focus({ preventScroll: true });
}

function alPulsar(e: MouseEvent) {
  const objetivo = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tentare-popup]') : null;
  if (!objetivo) return;
  const url = urlPopupPermitida(objetivo.getAttribute('data-tentare-popup'), ORIGEN);
  if (!url) {
    console.error('[tentare-widget] data-tentare-popup no apunta a un widget de Tentare.');
    return;
  }
  e.preventDefault();
  abrir(objetivo, url);
}

// Una sola vez por página aunque el script se pegue con varios botones.
const w = window as unknown as { __tentarePopup?: boolean };
if (!w.__tentarePopup) {
  w.__tentarePopup = true;
  document.addEventListener('click', alPulsar);
}

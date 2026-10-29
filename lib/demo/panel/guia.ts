// La barra de guía que va ENCIMA del panel real durante la demo: dice qué está pasando en
// la pantalla que se ve, y mueve al visitante por los pasos. Sin React: vive en el mismo
// paquete pequeño que el andamiaje (`public/demo-panel.js`), y dentro de un shadow DOM,
// colgando de <html> y no de <body>, para que ni los estilos del panel la toquen ni
// React la reconcilie (hidratar el <body> borraría lo que se le cuelgue).
import type { PantallaPanel } from '../modelo.ts';

export const CLAVE_PANEL = 'tentare:demo-panel';
export const CLAVE_VUELTA = 'tentare:demo-vuelta';

export interface PasoGuia { titulo: string; proposito: string; pantalla?: PantallaPanel }
export interface Guia { titulo: string; pasos: PasoGuia[]; paso: number }
export interface MarcaPanel { t: number; guia?: Guia; /** La dirección de /demo desde la que se entró (con su `?prueba`): a ella se vuelve. */ volver?: string }

export function leerMarca(): MarcaPanel | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(CLAVE_PANEL) ?? 'null') as MarcaPanel | null;
    return m && typeof m.t === 'number' && Date.now() - m.t < 2 * 3_600_000 ? m : null;
  } catch { return null; }
}

function guardar(m: MarcaPanel) { try { sessionStorage.setItem(CLAVE_PANEL, JSON.stringify(m)); } catch { /* sin almacenamiento */ } }

/** Sale del panel de demostración y vuelve a /demo; `valorar` = ya vio todo, toca la valoración. */
export function salir(valorar: boolean) {
  // A /demo con SU `?prueba=1` si lo traía: sin él, con la demo en modo prueba la página daba 404.
  const volver = leerMarca()?.volver;
  try {
    sessionStorage.removeItem(CLAVE_PANEL);
    if (valorar) sessionStorage.setItem(CLAVE_VUELTA, '1');
  } catch { /* idem */ }
  // Navegación COMPLETA a propósito: hay que salir del panel de demostración, no moverse dentro de él.
  window.location.assign(volver && volver.startsWith('/demo') ? volver : '/demo');
}

const CSS = `
:host { all: initial; }
.barra { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(760px, calc(100vw - 24px)); z-index: 2147483000;
  background: #22261F; color: #F6F4EF; border-radius: 20px; padding: 14px 18px 14px; box-shadow: 0 18px 48px rgba(0,0,0,.35);
  font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; box-sizing: border-box; }
.fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.paso { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #D9C29E; font-weight: 700; }
.salir { background: none; border: 0; color: #C9C6B8; cursor: pointer; font: inherit; text-decoration: underline; padding: 4px; }
h2 { margin: 4px 0 2px; font-size: 17px; font-weight: 700; letter-spacing: -.01em; }
p { margin: 0; color: #E4E1D6; }
.acciones { display: flex; gap: 10px; margin-top: 12px; justify-content: space-between; align-items: center; }
button.b { min-height: 40px; padding: 0 18px; border-radius: 999px; border: 1.5px solid rgba(246,244,239,.35); background: transparent; color: #F6F4EF; font: inherit; font-weight: 600; cursor: pointer; }
button.b:disabled { opacity: .35; cursor: default; }
button.p { background: #D9C29E; color: #22261F; border-color: #D9C29E; }
button:focus-visible { outline: 3px solid #D9C29E; outline-offset: 2px; }
.puntos { display: flex; gap: 5px; margin-top: 10px; }
.puntos i { height: 4px; flex: 1; border-radius: 99px; background: rgba(246,244,239,.2); }
.puntos i.h { background: #D9C29E; }
.anillo { position: fixed; z-index: 2147482000; pointer-events: none; border-radius: 14px; border: 3px solid #D9C29E; box-shadow: 0 0 0 4px rgba(217,194,158,.35), 0 0 0 9999px rgba(20,22,18,.22); transition: all .25s ease; }
.aviso { position: fixed; left: 50%; bottom: 190px; transform: translateX(-50%); z-index: 2147483001; max-width: min(520px, calc(100vw - 24px)); background: #F6F4EF; color: #22261F; border-radius: 14px; padding: 12px 16px; font: 14px/1.4 system-ui, -apple-system, sans-serif; box-shadow: 0 12px 32px rgba(0,0,0,.3); }
@media (max-width: 640px) {
  /* En el móvil la barra se sube por encima de la barra de pestañas del panel y ocupa menos. */
  .barra { bottom: calc(68px + env(safe-area-inset-bottom, 0px)); width: calc(100vw - 16px); padding: 10px 14px 12px; border-radius: 16px; }
  h2 { font-size: 15px; margin: 2px 0 2px; }
  p { font-size: 13px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .acciones { margin-top: 8px; gap: 8px; }
  button.b { min-height: 38px; padding: 0 14px; font-size: 13px; }
  .puntos { margin-top: 8px; }
  .aviso { bottom: 250px; }
}
@media (prefers-reduced-motion: no-preference) { .barra { animation: sube .25s ease-out both; } @keyframes sube { from { opacity: 0; transform: translate(-50%, 8px); } } }
`;

/** ¿Es esta dirección la del paso (misma ruta y, si el paso fija una pestaña u otro parámetro, el mismo)? */
export function esDireccionDelPaso(href: string, ruta: string, base: string = window.location.href): boolean {
  try {
    const u = new URL(href, base), r = new URL(ruta, base);
    if (u.origin !== r.origin || u.pathname !== r.pathname) return false;
    for (const [k, v] of r.searchParams) if (u.searchParams.get(k) !== v) return false;
    return true;
  } catch { return false; }
}

let sombraGuia: ShadowRoot | null = null;
let temporizadorAviso: number | undefined;
function avisar(texto: string) {
  if (!sombraGuia) return;
  sombraGuia.querySelector('.aviso')?.remove();
  const a = document.createElement('div'); a.className = 'aviso'; a.setAttribute('role', 'status'); a.textContent = texto;
  sombraGuia.append(a);
  window.clearTimeout(temporizadorAviso);
  temporizadorAviso = window.setTimeout(() => a.remove(), 4000);
}
const AVISO_BLOQUEO = 'Esta demo solo recorre lo que has preguntado. Usa «Siguiente paso» para seguir.';

/** La demo no deja ir a otros módulos: ni con un enlace, ni con el botón de atrás, ni con una navegación del propio panel. */
export function bloquearNavegacion(ruta: string) {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#') || esDireccionDelPaso(a.href, ruta)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    avisar(AVISO_BLOQUEO);
  }, true);
  // Las navegaciones que hace el propio panel (router.push): si van a otra pantalla, se quedan donde están.
  for (const metodo of ['pushState', 'replaceState'] as const) {
    const original = history[metodo].bind(history);
    history[metodo] = (data: unknown, unused: string, url?: string | URL | null) => {
      if (url != null && !esDireccionDelPaso(String(url), ruta)) { avisar(AVISO_BLOQUEO); return; }
      original(data, unused, url);
    };
  }
  window.addEventListener('popstate', () => {
    if (!esDireccionDelPaso(window.location.href, ruta)) window.location.replace(ruta);
  });
}

let textoGuia: HTMLElement | null = null;

/**
 * Rodea con un aro lo que importa de esta pantalla y lo trae a la vista. `focos` va del más concreto al más general: el aro
 * se pone en el primero que está a la vista y, cuando la persona abre un cajón y aparece uno más concreto, se mueve a él
 * (y la barra cambia a la pista de ese). Así cada paso se hace de verdad: «pulsa aquí» → «mira esto».
 */
export function resaltar(focos: string[], pistas: string[] | undefined, textoBase: string) {
  let anillo: HTMLDivElement | null = null;
  let elemento: Element | null = null;
  let activo = -1;
  const localizar = (buscado: string): Element | null => {
    const it = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (!(n.textContent ?? '').toLowerCase().includes(buscado)) continue;
      let e = n.parentElement;
      if (!e || e.closest('#tentare-demo-guia')) continue;
      const r0 = e.getBoundingClientRect();
      if (r0.width === 0 || r0.height === 0) continue;
      // Sube a la fila o a la celda que lo contiene, sin abarcar media pantalla ni una fila de varias celdas.
      for (let i = 0; i < 4 && e.parentElement; i++) {
        const rp = e.parentElement.getBoundingClientRect(), re = e.getBoundingClientRect();
        if (rp.height > 160 || rp.width > window.innerWidth * 0.9 || rp.width > re.width * 1.8) break;
        e = e.parentElement;
      }
      return e;
    }
    return null;
  };
  const colocar = () => {
    if (!sombraGuia) return;
    // Un enlace que la demo no deja abrir se ve apagado: así se sabe qué es parte del recorrido y qué no.
    const ruta = location.href;
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const fuera = !a.getAttribute('href')!.startsWith('#') && !esDireccionDelPaso(a.href, ruta);
      if (fuera !== a.hasAttribute('data-demo-fuera')) a.toggleAttribute('data-demo-fuera', fuera);
    });
    let hallado = -1;
    let el: Element | null = null;
    for (let i = 0; i < focos.length && !el; i++) { el = localizar(focos[i].toLowerCase()); if (el) hallado = i; }
    if (!el) { elemento = null; anillo?.remove(); anillo = null; activo = -1; return; }
    if (hallado !== activo || el !== elemento) {
      activo = hallado; elemento = el;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (textoGuia) textoGuia.textContent = pistas?.[hallado] ?? textoBase;
    }
    const r = el.getBoundingClientRect();
    if (!anillo) { anillo = document.createElement('div'); anillo.className = 'anillo'; anillo.setAttribute('aria-hidden', 'true'); sombraGuia.append(anillo); }
    Object.assign(anillo.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  };
  window.setInterval(colocar, 350);
}

export function montarGuia(m: MarcaPanel) {
  const guia = m.guia;
  if (!guia) return;
  const pintar = () => {
    if (document.getElementById('tentare-demo-guia')) return;
    const anfitrion = document.createElement('div');
    anfitrion.id = 'tentare-demo-guia';
    const sombra = anfitrion.attachShadow({ mode: 'open' });
    const paso = guia.pasos[guia.paso];
    const ultimo = guia.paso === guia.pasos.length - 1;
    const texto = paso.pantalla?.detalle ?? paso.proposito;
    const titulo = paso.pantalla?.titular ?? paso.titulo;
    const estilo = document.createElement('style'); estilo.textContent = CSS;
    const barra = document.createElement('section');
    barra.className = 'barra'; barra.setAttribute('role', 'region'); barra.setAttribute('aria-label', 'Guía de la demo');
    const fila = document.createElement('div'); fila.className = 'fila';
    const n = document.createElement('span'); n.className = 'paso'; n.textContent = `Demo · paso ${guia.paso + 1} de ${guia.pasos.length}`;
    const bs = document.createElement('button'); bs.className = 'salir'; bs.type = 'button'; bs.textContent = 'Salir de la demo'; bs.onclick = () => salir(false);
    fila.append(n, bs);
    const h = document.createElement('h2'); h.textContent = titulo;
    const t = document.createElement('p'); t.textContent = texto; textoGuia = t;
    const puntos = document.createElement('div'); puntos.className = 'puntos'; puntos.setAttribute('aria-hidden', 'true');
    guia.pasos.forEach((_, i) => { const e = document.createElement('i'); if (i <= guia.paso) e.className = 'h'; puntos.append(e); });
    const acciones = document.createElement('div'); acciones.className = 'acciones';
    const ir = (delta: number) => {
      const siguiente = guia.paso + delta;
      if (siguiente < 0) return;
      if (siguiente >= guia.pasos.length) { salir(true); return; }
      guardar({ ...m, t: Date.now(), guia: { ...guia, paso: siguiente } });
      const ruta = guia.pasos[siguiente].pantalla?.ruta;
      // Recarga completa: cada paso arranca el estudio de ejemplo con SUS datos (el bono en 4, en 5, caducado…).
      if (ruta) window.location.assign(ruta); else window.location.reload();
    };
    const ant = document.createElement('button'); ant.className = 'b'; ant.type = 'button'; ant.textContent = 'Paso anterior'; ant.disabled = guia.paso === 0; ant.onclick = () => ir(-1);
    const sig = document.createElement('button'); sig.className = 'b p'; sig.type = 'button'; sig.textContent = ultimo ? 'Terminar la demo' : 'Siguiente paso'; sig.onclick = () => ir(1);
    acciones.append(ant, sig);
    barra.append(fila, h, t, puntos, acciones);
    sombra.append(estilo, barra);
    sombraGuia = sombra;
    // Sitio para poder desplazar el panel POR ENCIMA de la barra: sin él, lo de abajo (la tarjeta del plan, la lista de clases)
    // queda tapado y no se puede ver. Va en un <style> propio colgado de <html>, fuera de lo que React gestiona.
    const hueco = document.createElement('style');
    hueco.textContent = 'body{padding-bottom:210px !important} @media (max-width:640px){body{padding-bottom:300px !important}} a[data-demo-fuera]{opacity:.38 !important;cursor:not-allowed !important}';
    document.documentElement.append(hueco, anfitrion);
    if (paso.pantalla?.foco?.length) resaltar(paso.pantalla.foco, paso.pantalla.pistas, texto);
  };
  const rutaPaso = guia.pasos[guia.paso].pantalla?.ruta;
  // Si se llegó a otra pantalla del recorrido que no es la del paso (el botón «atrás» del navegador), se vuelve a la del paso:
  // si no, la barra diría una cosa y la pantalla otra, con todos los enlaces bloqueados. Una sola vez por segundo, por si el panel
  // reescribe la dirección.
  if (rutaPaso && !esDireccionDelPaso(window.location.href, rutaPaso)) {
    try {
      const ultima = Number(sessionStorage.getItem('tentare:demo-corr') ?? 0);
      if (Date.now() - ultima > 1500) { sessionStorage.setItem('tentare:demo-corr', String(Date.now())); window.location.replace(rutaPaso); return; }
    } catch { /* sin almacenamiento: se deja como está */ }
  }
  if (rutaPaso) bloquearNavegacion(rutaPaso);
  if (document.readyState === 'complete') pintar(); else window.addEventListener('load', pintar, { once: true });
}

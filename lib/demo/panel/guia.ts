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
export interface MarcaPanel { t: number; guia?: Guia }

export function leerMarca(): MarcaPanel | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(CLAVE_PANEL) ?? 'null') as MarcaPanel | null;
    return m && typeof m.t === 'number' && Date.now() - m.t < 2 * 3_600_000 ? m : null;
  } catch { return null; }
}

function guardar(m: MarcaPanel) { try { sessionStorage.setItem(CLAVE_PANEL, JSON.stringify(m)); } catch { /* sin almacenamiento */ } }

/** Sale del panel de demostración y vuelve a /demo; `valorar` = ya vio todo, toca la valoración. */
export function salir(valorar: boolean) {
  try {
    sessionStorage.removeItem(CLAVE_PANEL);
    if (valorar) sessionStorage.setItem(CLAVE_VUELTA, '1');
  } catch { /* idem */ }
  // Navegación COMPLETA a propósito: hay que salir del panel de demostración, no moverse dentro de él.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign('/demo');
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
@media (prefers-reduced-motion: no-preference) { .barra { animation: sube .25s ease-out both; } @keyframes sube { from { opacity: 0; transform: translate(-50%, 8px); } } }
`;

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
    const t = document.createElement('p'); t.textContent = texto;
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
    // Sitio para poder desplazar el panel POR ENCIMA de la barra: sin él, lo de abajo (la tarjeta del plan, la lista de clases)
    // queda tapado y no se puede ver. Va en un <style> propio colgado de <html>, fuera de lo que React gestiona.
    const hueco = document.createElement('style');
    hueco.textContent = 'body{padding-bottom:210px !important}';
    document.documentElement.append(hueco, anfitrion);
  };
  if (document.readyState === 'complete') pintar(); else window.addEventListener('load', pintar, { once: true });
}

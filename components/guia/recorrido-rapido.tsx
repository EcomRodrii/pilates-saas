'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El recorrido rápido del alta nueva (PR-5): tres bocadillos la PRIMERA vez que
// la propietaria entra en su panel tras la bienvenida, con «Saltar» en cada uno
// (textos y colocación en lib/guia/recorrido.ts). No arranca la visita guiada
// de 43 pasos: esa es «Visita guiada completa», en la lista.
//
//   · Sale solo en el Resumen, que es donde está la lista que se explica, y
//     nunca con la visita guiada en marcha (no se abren dos cosas a la vez).
//   · Una vez: al enseñarse se apunta en el embudo (`recorrido_visto`, que vale
//     en cualquier navegador) y en este navegador, por si esa escritura falla.
//   · «Ver el recorrido rápido otra vez», en la lista, lo vuelve a abrir
//     (`EVENTO_RECORRIDO`).
//   · Señala lo que YA está en pantalla; si una parada no tiene a qué apuntar
//     (otro ancho, el WhatsApp ya no sale), se salta.
//
// Sin Tenti. Por portal al anfitrión del panel, como el resto de capas.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useTour } from '@/lib/tour-context';
import { anfitrionPortal } from '@/lib/panel-portal';
import { apuntarRecorridoVisto } from '@/lib/alta/embudo-cliente';
import { anotarEnEstadoAlta } from '@/lib/alta/estado-cliente';
import { EVENTO_RECORRIDO, PARADAS_RECORRIDO, claveRecorridoVisto, colocarBocadillo, type Caja, type Lado } from '@/lib/guia/recorrido';

const ANCHO = 290;

function visible(sel: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const objetivoDe = (i: number) => {
  for (const sel of PARADAS_RECORRIDO[i].objetivos) {
    const el = visible(sel);
    if (el) return el;
  }
  return null;
};

/** La siguiente parada con algo a lo que apuntar, desde `desde`; `null` si no queda ninguna. */
function siguienteConObjetivo(desde: number): number | null {
  for (let i = desde; i < PARADAS_RECORRIDO.length; i++) if (objetivoDe(i)) return i;
  return null;
}

function yaVistoAqui(studioId: string): boolean {
  try { return localStorage.getItem(claveRecorridoVisto(studioId)) === '1'; } catch { return false; }
}

export function RecorridoRapido({ studioId, puedeEmpezarSolo }: {
  studioId: string;
  /** El servidor dice que aún no lo ha visto (y es la propietaria de un estudio del alta nueva). */
  puedeEmpezarSolo: boolean;
}) {
  const pathname = usePathname();
  const { activo: visitaEnMarcha } = useTour();
  const [parada, setParada] = useState<number | null>(null);
  const [sitio, setSitio] = useState<{ caja: Caja; top: number; left: number; lado: Lado } | null>(null);
  const bocadillo = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  const empezar = useCallback(() => {
    const i = siguienteConObjetivo(0);
    if (i === null) return;
    try { localStorage.setItem(claveRecorridoVisto(studioId), '1'); } catch { /* lo apunta el servidor */ }
    apuntarRecorridoVisto();
    anotarEnEstadoAlta({ recorridoVisto: true });
    setParada(i);
  }, [studioId]);

  // La primera vez, solo: en el Resumen, sin la visita en marcha, y con un
  // momento para que la lista ya esté pintada.
  useEffect(() => {
    if (!puedeEmpezarSolo || visitaEnMarcha || pathname !== '/dashboard' || yaVistoAqui(studioId)) return;
    const t = setTimeout(empezar, 900);
    return () => clearTimeout(t);
  }, [puedeEmpezarSolo, visitaEnMarcha, pathname, studioId, empezar]);

  // «Ver el recorrido rápido otra vez».
  useEffect(() => {
    const f = () => empezar();
    window.addEventListener(EVENTO_RECORRIDO, f);
    return () => window.removeEventListener(EVENTO_RECORRIDO, f);
  }, [empezar]);

  // Cambiar de pantalla lo cierra: lo que señalaba ya no está.
  const [rutaAlAbrir, setRutaAlAbrir] = useState(pathname);
  if (rutaAlAbrir !== pathname) {
    setRutaAlAbrir(pathname);
    if (parada !== null) setParada(null);
  }

  const cerrar = useCallback(() => { setParada(null); setSitio(null); }, []);
  const seguir = useCallback(() => {
    if (parada === null) return;
    const sig = siguienteConObjetivo(parada + 1);
    if (sig === null) cerrar();
    else setParada(sig);
  }, [parada, cerrar]);

  // Dónde va el bocadillo, y otra vez si cambia el tamaño o se desplaza.
  useLayoutEffect(() => {
    if (parada === null) return;
    // `seguir` y `empezar` ya solo llevan a paradas con algo a lo que apuntar.
    const el = objetivoDe(parada);
    if (!el) return;
    const r0 = el.getBoundingClientRect();
    if (r0.top < 0 || r0.bottom > window.innerHeight) el.scrollIntoView({ block: 'center' });
    let raf = 0;
    const medir = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const caja = { top: r.top, left: r.left, width: r.width, height: r.height };
        const alto = bocadillo.current?.offsetHeight ?? 160;
        const ancho = Math.min(ANCHO, window.innerWidth - 16);
        setSitio({ caja, ...colocarBocadillo(caja, { ancho: window.innerWidth, alto: window.innerHeight }, { ancho, alto }) });
      });
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [parada]);

  useEffect(() => {
    if (parada === null) return;
    boton.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [parada, cerrar]);

  if (parada === null) return null;
  const p = PARADAS_RECORRIDO[parada];
  const ultima = siguienteConObjetivo(parada + 1) === null;
  const n = parada + 1;

  return createPortal(
    <>
      {/* Lo que se señala, enmarcado. Sin tapar nada: no se puede tocar a través de él. */}
      {sitio && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[70] rounded-2xl transition-[top,left,width,height] duration-300"
          style={{
            top: sitio.caja.top - 4, left: sitio.caja.left - 4, width: sitio.caja.width + 8, height: sitio.caja.height + 8,
            boxShadow: '0 0 0 2px var(--t-blue-500)',
          }}
        />
      )}
      <div
        ref={bocadillo}
        role="dialog"
        aria-modal="false"
        aria-label={`Recorrido rápido, ${n} de ${PARADAS_RECORRIDO.length}`}
        data-testid="recorrido-rapido"
        className="t-glass-dark fixed z-[71] rounded-2xl p-4 shadow-t-floating"
        style={{
          width: `min(${ANCHO}px, calc(100vw - 16px))`,
          top: sitio?.top ?? -9999,
          left: sitio?.left ?? -9999,
          visibility: sitio ? 'visible' : 'hidden',
        }}
      >
        <p className="font-t-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--t-ink-300)]">{n} / {PARADAS_RECORRIDO.length}</p>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug">{p.titulo}</p>
        <p className="mt-1 text-[13px] leading-[19px] text-[color:var(--t-ink-300)]">{p.texto}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={cerrar} className="zona-tactil rounded-full px-1 text-[13px] font-medium text-[color:var(--t-ink-300)] hover:underline">
            Saltar
          </button>
          <button
            ref={boton}
            type="button"
            onClick={seguir}
            className="zona-tactil h-8 rounded-full bg-[color:var(--t-cream)] px-3.5 text-[13px] font-semibold text-[color:var(--t-ink-900)] transition-[filter] hover:brightness-95"
          >
            {ultima ? 'Entendido' : 'Siguiente'}
          </button>
        </div>
      </div>
    </>,
    anfitrionPortal(),
  );
}

'use client';

import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { medidasMac } from '@/lib/marco-mac-medidas';

// Un MacBook para enseñar algo «en un ordenador» en el panel, hermano de `MarcoIphone`
// (components/ui/marco-iphone.tsx): la tapa con su marco negro fino y el notch arriba en el
// centro, y debajo la base de aluminio con la muesca para abrirlo.
//
// A diferencia del iPhone, no va a una escala fija: ocupa el ANCHO que haya (o `ancho`, si
// se le da) y la pantalla mide lo que ese ancho deja, con la proporción de un MacBook
// (lib/marco-mac-medidas.ts). Así lo de dentro —que se mide solo, como la vista previa de
// los widgets— decide su propia escala, y nunca se sale de la página.
//
// `children` ocupa la pantalla entera por DEBAJO del notch: arriba queda una franja del alto
// del notch (la barra de menús del Mac, con los colores del panel), para que no tape nada.
// Los colores del aparato (el negro y el aluminio) son el aparato: no siguen el modo oscuro.

const NEGRO = '#0B0B0C';
const ALUMINIO = 'linear-gradient(180deg, #e9eaec 0%, #cfd1d4 45%, #a9abb0 100%)';
const CANTO = 'linear-gradient(180deg, #b9bbbf, #8d8f94)';

export interface MarcoMacProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** El ancho del portátil entero (la base). Sin él, el de lo que lo contiene. */
  ancho?: number;
  children: ReactNode;
}

export function MarcoMac({ ancho, children, style, ...resto }: MarcoMacProps) {
  const caja = useRef<HTMLDivElement | null>(null);
  const [medido, setMedido] = useState(0);
  useLayoutEffect(() => {
    if (ancho !== undefined) return;
    const el = caja.current;
    if (!el) return;
    const medir = () => setMedido(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ancho]);
  const m = medidasMac(ancho ?? medido);
  const listo = m.pantalla.ancho > 0;

  return (
    <div {...resto} ref={caja} style={{ ...style, width: ancho ?? '100%', maxWidth: '100%' }}>
      {listo && (
        <>
          {/* La tapa: marco negro, la pantalla dentro y el notch encima de su borde de arriba. */}
          <div
            style={{
              width: m.tapa, margin: '0 auto', background: NEGRO,
              padding: `${m.bisel}px ${m.bisel}px ${m.biselInferior}px`,
              borderRadius: `${Math.round(m.bisel * 2.4)}px ${Math.round(m.bisel * 2.4)}px 3px 3px`,
              boxShadow: '0 0 0 1px rgba(255,255,255,.08) inset, 0 18px 40px -18px rgba(0,0,0,.45)',
            }}
          >
            <div
              data-testid="mac-pantalla"
              style={{
                position: 'relative', width: m.pantalla.ancho, height: m.pantalla.alto, overflow: 'hidden',
                borderRadius: Math.max(2, Math.round(m.bisel * 0.6)), background: NEGRO,
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* La barra de menús (en los colores del panel, clara u oscura): del alto del notch, para que
                  el notch no tape lo de dentro y se vea recortado contra ella, como en el Mac. */}
              <div aria-hidden data-testid="mac-barra" className="shrink-0 border-b border-border bg-muted" style={{ height: m.barraSuperior }} />
              <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>{children}</div>
              <span
                aria-hidden
                data-testid="mac-notch"
                style={{
                  position: 'absolute', top: 0, left: '50%', width: m.notch.ancho, height: m.notch.alto,
                  marginLeft: -m.notch.ancho / 2, background: NEGRO,
                  borderRadius: `0 0 ${Math.round(m.notch.alto * 0.6)}px ${Math.round(m.notch.alto * 0.6)}px`,
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: '50%', left: '50%', width: 4, height: 4, margin: '-2px 0 0 -2px', borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 35%, #33415f, #0a0d16)',
                  }}
                />
              </span>
            </div>
          </div>
          {/* La base de aluminio, más ancha que la tapa, con la muesca para abrir en el centro. */}
          <div
            aria-hidden
            data-testid="mac-base"
            style={{
              position: 'relative', width: m.base.ancho, height: m.base.alto, margin: '0 auto',
              background: ALUMINIO, borderRadius: `2px 2px ${Math.round(m.base.alto * 0.9)}px ${Math.round(m.base.alto * 0.9)}px`,
              boxShadow: '0 10px 18px -10px rgba(0,0,0,.45)',
            }}
          >
            <span
              data-testid="mac-muesca"
              style={{
                position: 'absolute', top: 0, left: '50%', width: m.muesca.ancho, height: m.muesca.alto, marginLeft: -m.muesca.ancho / 2,
                background: CANTO, borderRadius: `0 0 ${m.muesca.alto}px ${m.muesca.alto}px`,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

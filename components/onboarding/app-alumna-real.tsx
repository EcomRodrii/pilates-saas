'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La app de las alumnas, la REAL, dentro de un iPhone 17 Pro.
//
// No es un dibujo: es `/portal/<slug>` (la misma app que abren sus alumnas) en
// un iframe del mismo origen, a 402×874 pt y escalado a la caja del móvil. Es el
// mismo mecanismo que la vista previa de «Apariencia de tu app»
// (components/apariencia/editor-apariencia-app.tsx): el marco propio hace que la
// guardia de sesión pinte Inicio con el catálogo público en vez del login
// (lib/student/vista-previa-panel.ts), y `/portal/` solo admite marco de su
// propio origen (proxy.ts).
//
// Lo que se ve es lo que hay en la base de datos AHORA: su nombre, su logo, su
// tema y las clases que ya existan. Por eso `version` recarga el marco cuando el
// asistente acaba de crear las clases. El pie «Así verán tus alumnas tu app» va
// aquí dentro y solo sale cuando el marco ha cargado de verdad.
//
// Sin interacción y sin ruido: el marco va `inert` y `aria-hidden` (no es un
// control más del asistente), sin clics y sin foco, y se monta tras un respiro
// para no competir con la primera pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { MockupIphone, estilosMockupIphone } from '@/components/landing/MockupIphone';

const ANCHO = 402;
const ALTO = 874;
const RESPIRO_MS = 400;

export function AppAlumnaReal({ slug, ancho, version = 0, className = '' }: {
  slug: string;
  /** Ancho del móvil en px. */
  ancho: number;
  /** Cambiarlo recarga la app (las clases acaban de crearse). */
  version?: number;
  className?: string;
}) {
  const pantalla = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(ancho / ANCHO);
  const [montado, setMontado] = useState(false);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMontado(true), RESPIRO_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const el = pantalla.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / ANCHO);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Un marco nuevo (otra versión) vuelve a «cargando». Durante el render, no en
  // un efecto: así no hay un pintado con el pie de la versión anterior.
  const [vAnterior, setVAnterior] = useState(version);
  if (vAnterior !== version) { setVAnterior(version); setCargado(false); }

  return (
    <figure className={`m-0 ${className}`} data-testid="app-alumna-real">
      <style>{estilosMockupIphone}</style>
      <MockupIphone completo style={{ ['--iw' as string]: `${ancho}px`, margin: '0 auto' }}>
        <div ref={pantalla} className="absolute inset-0 overflow-hidden bg-white">
          {montado && (
            <iframe
              key={version}
              title="La app de tus alumnas, tal y como la ven"
              src={`/portal/${encodeURIComponent(slug)}`}
              onLoad={() => setCargado(true)}
              // `inert`: ni foco ni clics ni lectores de pantalla. Un marco más
              // en la cadena de tabulación del asistente sería una trampa.
              {...({ inert: true } as object)}
              aria-hidden="true"
              tabIndex={-1}
              loading="lazy"
              style={{
                width: ANCHO, height: ALTO, border: 0, transformOrigin: 'top left', transform: `scale(${escala})`,
                pointerEvents: 'none', opacity: cargado ? 1 : 0, transition: 'opacity 300ms',
              }}
            />
          )}
        </div>
      </MockupIphone>
      <figcaption className="mt-3 text-center text-[12.5px] text-muted-foreground" aria-live="polite">
        {cargado ? 'Así verán tus alumnas tu app' : 'Cargando tu app…'}
      </figcaption>
    </figure>
  );
}

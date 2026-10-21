'use client';

// La app de la alumna, la REAL (`/portal/<slug>` en un iframe del mismo origen),
// dentro de un iPhone y con el color que se está eligiendo pintado encima
// (`pintarBorrador`, lib/apariencia/borrador-en-marco.ts): el mismo mecanismo que
// la vista previa de «Apariencia de tu app». No es un dibujo de la app.
//
// Lo que no es el color (su logo, su nombre) es lo que ya hay guardado: por eso
// `recarga` vuelve a pedir la app cuando se acaba de guardar uno de los dos.
//
// Sin interacción: es una vista previa, no un control más del paso (`inert`,
// como la app de la bienvenida de siempre, components/onboarding/app-alumna-real.tsx).

import { useEffect, useRef, useState } from 'react';
import { MarcoIphone, PANTALLA_IPHONE } from '@/components/ui/marco-iphone';
import { pintarBorrador } from '@/lib/apariencia/borrador-en-marco';

export function AppEnVivo({ slug, css, recarga, escala }: {
  slug: string;
  /** El borrador, ya en CSS (`temaAppCssText(..., { completo: true })`). */
  css: string;
  recarga: number;
  escala: number;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => { pintarBorrador(ref.current, css); }, [css]);
  // Otra versión de la app (otro logo, otro nombre): se funde, sin el salto de blanco.
  const [recargaVista, setRecargaVista] = useState(recarga);
  if (recargaVista !== recarga) { setRecargaVista(recarga); setCargando(true); }
  return (
    <figure className="m-0 flex flex-col items-center" data-testid="app-en-vivo">
      <MarcoIphone escala={escala} tinta="auto" indicador="auto">
        <iframe
          key={recarga}
          ref={ref}
          title="La app de tus alumnas, con tu color"
          src={`/portal/${encodeURIComponent(slug)}`}
          onLoad={() => { pintarBorrador(ref.current, css); setCargando(false); }}
          {...({ inert: true } as object)}
          aria-hidden="true"
          tabIndex={-1}
          className="bg-white transition-opacity duration-300"
          style={{ width: PANTALLA_IPHONE.ancho, height: PANTALLA_IPHONE.alto, border: 0, opacity: cargando ? 0.35 : 1, pointerEvents: 'none' }}
        />
      </MarcoIphone>
      <figcaption className="mt-3 text-center text-[12.5px] text-muted-foreground" aria-live="polite">
        {cargando ? 'Cargando tu app…' : 'Tu app de verdad, con el color que eliges'}
      </figcaption>
    </figure>
  );
}

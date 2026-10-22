'use client';

// La app de la alumna, la REAL (`/portal/<slug>` en un iframe del mismo origen),
// dentro de un iPhone y con el color que se está eligiendo pintado encima
// (`pintarBorrador`, lib/apariencia/borrador-en-marco.ts): el mismo mecanismo que
// la vista previa de «Apariencia de tu app». No es un dibujo de la app.
//
// Lo que no es el color (su logo, su nombre) es lo que ya hay guardado: por eso
// `recarga` vuelve a pedir la app cuando se acaba de guardar uno de los dos.
//
// Se puede TOCAR (fundador, 21-oct-2026: «lo único malo es que no es
// interactivo»): cambiar de pestaña, abrir pantallas, como en Apariencia. Sin que
// eso escriba nada: el marco lleva el nombre de «solo mirar»
// (lib/student/solo-mirar.ts), que en la app corta toda escritura —ni reservas,
// ni cuentas de alumna, ni códigos— y deja ver cada pantalla sin sesión, como la
// vería una recién llegada.

import { useEffect, useRef, useState } from 'react';
import { MarcoIphone, PANTALLA_IPHONE } from '@/components/ui/marco-iphone';
import { pintarBorrador } from '@/lib/apariencia/borrador-en-marco';
import { NOMBRE_MARCO_SOLO_MIRAR } from '@/lib/student/solo-mirar';

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
          name={NOMBRE_MARCO_SOLO_MIRAR}
          title="La app de tus alumnas, con tu color. Puedes tocarla: aquí no se reserva ni se crea nada"
          src={`/portal/${encodeURIComponent(slug)}`}
          onLoad={() => { pintarBorrador(ref.current, css); setCargando(false); }}
          className="bg-white transition-opacity duration-300"
          style={{ width: PANTALLA_IPHONE.ancho, height: PANTALLA_IPHONE.alto, border: 0, opacity: cargando ? 0.35 : 1 }}
        />
      </MarcoIphone>
      <figcaption className="mt-3 text-center text-[12.5px] text-muted-foreground" aria-live="polite">
        {cargando ? 'Cargando tu app…' : 'Tu app de verdad, con el color que eliges. Tócala: aquí no se reserva ni se crea nada.'}
      </figcaption>
    </figure>
  );
}

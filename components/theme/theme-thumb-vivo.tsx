'use client';

// Miniatura VIVA: el portal de verdad, en pequeño.
//
// ⚠️ Sustituye al dibujo a mano de `theme-thumb.tsx`, que pintaba "Hola, Ana."
// y "Pilates Reformer" fijos. Aquel reflejaba color, accesos rápidos y barra
// inferior — pero NO la cabecera, NI la tarjeta principal, NI `bloquesHome`.
// Y eso último es justo lo que separa un tema de una paleta: la tira de siete
// días de Oliva, los retos de Bloom, el anillo de Noir. En la biblioteca los
// cinco temas se veían "lo mismo de otro color", que es literalmente el
// resultado que el encargo pedía evitar.
//
// El fichero anterior documentaba por qué NO era un iframe: "la biblioteca
// enseña 6+ temas a la vez, y cada iframe pide su propio token firmado y su
// propia carga del catálogo". Las dos mitades se resuelven aquí:
//  · **El token se pide UNA vez** y lo comparte toda la biblioteca (es del
//    estudio, no del tema) — se recibe por prop.
//  · **El iframe no se monta hasta que se ve** (IntersectionObserver), así
//    que abrir la pantalla no dispara cinco cargas del catálogo de golpe.
//
// Lo que se gana a cambio: la miniatura no PUEDE mentir, porque es el portal.
// Una fuente de verdad, que es la regla que este editor lleva persiguiendo.

import { useEffect, useRef, useState } from 'react';
import { themeToCssVars } from '@/lib/theme-runtime';
import { MENSAJE_TEMA_PREVIEW, resolveTemaJs } from '@/lib/theme-preview-puente';
import { altoOcupado } from '@/lib/theme/dispositivos';
import type { ThemeConfig } from '@/lib/theme-schema';
import type { BloqueHome } from '@/lib/portal-home-bloques';

// Ancho real del móvil de referencia y alto del recorte que se enseña. El
// iframe se declara SIEMPRE a este tamaño y se encoge con `transform`: si se
// dejara adaptarse, sus media queries verían un móvil de 96 px de ancho.
const ANCHO = 392;
const ALTO = 720;

export function ThemeThumbVivo({
  config, bloques, slug, token, ancho = 96, etiqueta,
}: {
  config: ThemeConfig;
  /** Los bloques del Inicio TAL COMO los dejaría este tema al instalarse. */
  bloques: BloqueHome[] | null;
  slug: string | null;
  /** Compartido por toda la biblioteca: es del estudio, no del tema. */
  token: string | null;
  ancho?: number;
  etiqueta: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const marco = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [listo, setListo] = useState(false);
  const escala = ancho / ANCHO;

  // No se monta hasta que entra en pantalla. `rootMargin` generoso para que
  // llegue cargada al llegar el ojo, no después.
  useEffect(() => {
    const el = caja.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entradas) => { if (entradas.some((e) => e.isIntersecting)) setVisible(true); },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // El tema y los bloques viajan por los MISMOS canales que usa la vista
  // previa del editor — sin protocolo nuevo. Se reenvía en cada cambio de
  // `config`/`bloques` porque el borrador se edita en vivo desde la biblioteca
  // (instalar un tema actualiza la miniatura de "Tu tema" sin recargar).
  useEffect(() => {
    if (!listo) return;
    const w = marco.current?.contentWindow;
    if (!w) return;
    w.postMessage(
      {
        type: MENSAJE_TEMA_PREVIEW,
        vars: themeToCssVars(config) as Record<string, string>,
        temaJs: resolveTemaJs(config),
      },
      window.location.origin,
    );
    if (bloques) {
      w.postMessage(
        { type: 'tentare-bloques-preview', pantalla: 'home', bloques, seleccionId: null, modo: 'navegar' },
        window.location.origin,
      );
    }
  }, [listo, config, bloques]);

  const marcoCls = 'rounded-[10px] overflow-hidden border border-border bg-white';

  if (!slug || !token) {
    // Mismo hueco que ocuparía la miniatura: sin esto la fila da un salto
    // cuando llega el token.
    return (
      <div ref={caja} style={{ width: ancho, height: altoOcupado(ALTO, escala) }} className={`${marcoCls} bg-muted`} />
    );
  }

  return (
    <div ref={caja} style={{ width: ancho, height: altoOcupado(ALTO, escala) }} className={marcoCls}>
      {visible && (
        <iframe
          ref={marco}
          src={`/portal-preview/${slug}?t=${token}`}
          title={`Vista previa del tema ${etiqueta}`}
          onLoad={() => setListo(true)}
          scrolling="no"
          // `pointer-events: none`: es una miniatura para mirar, no para usar.
          // Sin esto se puede navegar dentro de una tarjeta de 96 px.
          style={{
            width: ANCHO, height: ALTO, border: 0, display: 'block',
            transform: `scale(${escala})`, transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
          tabIndex={-1}
          aria-hidden
        />
      )}
    </div>
  );
}

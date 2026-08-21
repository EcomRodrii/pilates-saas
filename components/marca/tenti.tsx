'use client';

// ─────────────────────────────────────────────────────────────────────────────
// <Tenti> — la mascota de Tentare, en línea y paramétrica.
//
// Mismo patrón que <LogoTentare>: SVG en línea con los trazados de
// `tenti-poses.ts`, color por custom properties y NUNCA una imagen. Los
// motivos son los mismos que ya valieron para el logo, y uno más propio:
//
//   · Nítida a cualquier tamaño y sin pedir un PNG por pose (son 25).
//   · El color sale de `--tenti-*`, así que sigue al modo oscuro sola.
//   · Si el dibujo cambia, cambia en un sitio — no conviven dos Tentis a un
//     clic de distancia, que es LITERALMENTE lo que pasó con el logo cuando
//     había PNG sueltos por el repo.
//
// ⚠️ `useId()` por instancia, y por eso `'use client'`. Las poses se apoyan en
// símbolos compartidos (`<use href="#std">`), y con ids fijos dos Tentis en la
// misma página harían que la segunda resolviera sus `use` contra los defs de
// la primera. Es EXACTAMENTE el bug que ya documenta <LogoTentare> con el id
// del degradado, donde la barra móvil y la de escritorio conviven en el DOM.
// Aquí es peor: no fallaría el color, fallaría el dibujo entero.
// ─────────────────────────────────────────────────────────────────────────────

import { useId } from 'react';
import { TENTI_DEFS, TENTI_POSES, TENTI_ETIQUETAS, type TentiPose } from './tenti-poses';

export type { TentiPose };
export { TENTI_POSES, TENTI_ETIQUETAS };

export function Tenti({
  pose = 'hola',
  alto = 120,
  titulo,
  className,
  style,
}: {
  pose?: TentiPose;
  /** Alto en px. El dibujo es cuadrado (viewBox 160×160). */
  alto?: number;
  /** Si se pasa, la mascota es CONTENIDO y se anuncia. Sin él es decorativa
   *  y queda oculta a los lectores de pantalla — que es lo correcto cuando el
   *  texto de al lado ya dice lo mismo. */
  titulo?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const uid = useId();
  // Los ids del kit son cortos ('std', 'tho', 'sp'...). Se les antepone el uid
  // de esta instancia, tanto en la definición como en cada `href`, para que un
  // <use> nunca pueda cruzar de un Tenti a otro.
  const prefijo = `t${uid.replace(/[^a-zA-Z0-9]/g, '')}`;
  const conPrefijo = (s: string) =>
    s.replace(/id="([^"]+)"/g, `id="${prefijo}-$1"`).replace(/href="#([^"]+)"/g, `href="#${prefijo}-$1"`);

  return (
    <svg
      viewBox="0 0 160 160"
      width={alto}
      height={alto}
      className={className}
      style={{ display: 'block', flex: 'none', ...style }}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <defs dangerouslySetInnerHTML={{ __html: conPrefijo(TENTI_DEFS) }} />
      <g dangerouslySetInnerHTML={{ __html: conPrefijo(TENTI_POSES[pose]) }} />
    </svg>
  );
}

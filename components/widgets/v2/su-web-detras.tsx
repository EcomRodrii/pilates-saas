'use client';

import type { ReactNode } from 'react';
import { Globe, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCO, Segmentado, TACTIL } from '../piezas';
import type { FaseWebReal } from './usar-web-real';

// La web REAL del estudio detrás del widget, en el marco de la vista previa
// («Tu web» v2). Dos piezas: lo que se pinta dentro del marco (`SuWebDetras`) y
// el control de encima (`ControlSuWeb`: el interruptor «Ver mi web / Ver página
// de ejemplo» y el aviso cuando su web no se puede enseñar).
//
// Lo que se enseña es el documento de /vista-previa-web (lib/widgets/web-real/
// marco-html.ts), que a su vez enmarca su web con `sandbox="allow-scripts"`. El
// panel no lee nada de ella.

export type VerWeb = 'web' | 'ejemplo';

export interface FondoWeb {
  fase: Exclude<FaseWebReal, 'sin-dominio'>;
  /** El documento que enmarca su web, con su permiso (solo si `fase === 'se-deja'`). */
  src: string | null;
  ver: VerWeb;
  onVer: (v: VerWeb) => void;
  onProbar: () => void;
}

/** Las frases del aviso: sin jerga y sin culpa. Nada de cabeceras ni protocolos en pantalla. */
export const AVISO_NO_SE_DEJA = 'Tu web no permite que la mostremos aquí (es una protección normal de muchas webs). Así se verá tu widget en una página de ejemplo.';
export const AVISO_SIN_SABER = 'Ahora no hemos podido abrir tu web para mostrarla aquí. Así se verá tu widget en una página de ejemplo.';
export const AVISO_TOPE = 'Has probado muchas veces seguidas. Vuelve a intentarlo dentro de un rato. Mientras, así se verá tu widget en una página de ejemplo.';
export const ETIQUETA_COLOCACION = 'Así quedaría: colocación orientativa';
export const FRASE_COLOCACION = 'No sabemos dónde lo pegarás: aquí va en un sitio fijo. Lo que sí ves de verdad es cómo pega con la letra y el color de tu web.';

/**
 * Su web a pantalla completa dentro del marco y, encima, el widget en un sitio
 * fijo (centrado a media altura, con una sombra suave). No tapa la barra de
 * direcciones: el marco la pinta por encima de este contenido. El widget que va
 * encima es el mismo /reservar de la vista previa, no un dibujo nuevo.
 */
export function SuWebDetras({ src, children }: { src: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0" data-su-web="">
      {/* NUESTRO documento (mismo origen); la web de ella va dentro, con su propio sandbox. */}
      <iframe
        src={src}
        title="Tu web, de fondo (orientativo)"
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute inset-0 block size-full border-0 bg-white"
      />
      {/* Lo que va encima se reparte DENTRO del alto del marco (la pantalla del Mac es baja): la etiqueta no encoge
          y el widget se desplaza en su caja si es más alto de lo que queda. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 py-3">
        <span
          data-colocacion-orientativa=""
          className="pointer-events-auto shrink-0 rounded-full bg-foreground px-3 py-1 text-[11.5px] font-semibold text-background shadow-md"
        >
          {ETIQUETA_COLOCACION}
        </span>
        <div className="pointer-events-auto min-h-0 max-h-[74%] w-full max-w-full overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * El interruptor y el aviso. Solo con una web autorizada (sin ella, el ejemplo
 * de siempre y la leyenda lo dice). Mientras se comprueba, se enseña el ejemplo.
 */
export function ControlSuWeb({ f, tinta }: { f: FondoWeb; tinta: string }) {
  const sePuede = f.fase === 'se-deja';
  const aviso = f.fase === 'no-se-deja' ? AVISO_NO_SE_DEJA : f.fase === 'sin-saber' ? AVISO_SIN_SABER : f.fase === 'tope' ? AVISO_TOPE : null;
  return (
    <div className="space-y-2" data-control-su-web="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmentado<VerWeb>
          etiqueta="Qué se ve detrás del widget"
          tamano="compacto"
          valor={sePuede ? f.ver : 'ejemplo'}
          onChange={f.onVer}
          opciones={[
            { valor: 'web', nombre: 'Ver mi web', icono: <Globe size={13} aria-hidden />, desactivada: !sePuede },
            { valor: 'ejemplo', nombre: 'Ver página de ejemplo' },
          ]}
        />
        {f.fase === 'comprobando' && <p role="status" className={cn('text-[11.5px]', tinta)}>Comprobando tu web…</p>}
      </div>
      {aviso && (
        <div role="note" data-aviso-su-web={f.fase} className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3 py-2">
          <p className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-[12px] leading-snug text-foreground">
            <Info size={13} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">{aviso}</span>
          </p>
          <button
            type="button"
            onClick={f.onProbar}
            className={cn(TACTIL, 'shrink-0 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background hover:bg-foreground/90', FOCO)}
          >
            Probar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { nombrePlataforma, pasosConDibujo, type DibujoPaso, type PlataformaWeb } from '@/lib/widgets/recetas';
import type { MetodoIntegracion } from '@/lib/widgets/catalogo';
import { FOCO } from '../piezas';

// «Ponlo en tu web» v2 (decisión 3): los pasos de SU plataforma, cada uno con un
// dibujo. Los textos son los de siempre (`pasosConDibujo` es la fuente de
// `pasosEnTuWeb`, lo que también lleva el mensaje para quien le hace la web).
//
// Los dibujos son genéricos por TIPO de paso (añadir un bloque, pegar, publicar…),
// nunca la pantalla de una plataforma: ni sus logos ni sus colores (decisión 7).
// Con `currentColor`: toman el gris del texto y se leen en claro y en oscuro.

const CON_NOMBRE: ReadonlySet<PlataformaWeb> = new Set(['wordpress', 'wix', 'squarespace', 'webflow']);

export function PasosConDibujo({ plataforma, metodo, onCambiarWeb }: {
  plataforma: PlataformaWeb | null;
  metodo: MetodoIntegracion;
  /** «¿No es WordPress? Cambiar»: vuelve a «Dónde va», donde se pregunta. */
  onCambiarWeb?: () => void;
}) {
  // Con una agencia, los pasos son los de una web cualquiera (los que le llegan en el mensaje).
  const pasos = pasosConDibujo(plataforma === 'agencia' ? 'otra' : plataforma, metodo);
  const nombre = plataforma && CON_NOMBRE.has(plataforma) ? nombrePlataforma(plataforma) : null;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-[13.5px] font-semibold text-foreground">
          {nombre ? `En ${nombre}, en ${pasos.length} pasos` : `En ${pasos.length} pasos`}
        </h4>
        {nombre && onCambiarWeb && (
          <button
            type="button"
            onClick={onCambiarWeb}
            className={cn('min-h-11 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline [@media(pointer:fine)]:min-h-8', FOCO)}
          >
            ¿No es {nombre}? Cambiar
          </button>
        )}
      </div>
      <ol className={cn('grid gap-2', pasos.length === 3 ? '@md/config:grid-cols-3' : '@md/config:grid-cols-2')}>
        {pasos.map((p, i) => (
          <li key={p.texto} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-2.5">
            <span aria-hidden className="block rounded-lg bg-muted/60 p-1.5 text-muted-foreground"><DibujoDePaso dibujo={p.dibujo} /></span>
            <span className="flex gap-2 text-[12.5px] leading-relaxed text-foreground">
              <span aria-hidden className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">{i + 1}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DibujoDePaso({ dibujo }: { dibujo: DibujoPaso }) {
  return (
    <svg viewBox="0 0 120 56" className="h-12 w-full" data-dibujo-paso={dibujo}>
      {DIBUJO[dibujo]}
    </svg>
  );
}

/** Una página: el marco y dos líneas de texto arriba. */
const pagina = (
  <>
    <rect x="10" y="5" width="100" height="46" rx="4" fill="none" stroke="currentColor" strokeOpacity=".45" />
    <rect x="17" y="11" width="34" height="4" rx="2" fill="currentColor" fillOpacity=".3" />
    <rect x="17" y="19" width="56" height="3" rx="1.5" fill="currentColor" fillOpacity=".2" />
  </>
);

/** Un recuadro de código (oscuro en claro, claro en oscuro) con sus líneas en el color de la tarjeta. */
const codigo = (y: number) => (
  <>
    <rect x="18" y={y} width="84" height="26" rx="3" fill="currentColor" fillOpacity=".75" />
    <rect x="24" y={y + 5} width="40" height="3" rx="1.5" fill="var(--card)" fillOpacity=".55" />
    <rect x="24" y={y + 11} width="62" height="3" rx="1.5" fill="var(--card)" fillOpacity=".4" />
    <rect x="24" y={y + 17} width="48" height="3" rx="1.5" fill="var(--card)" fillOpacity=".3" />
  </>
);

const DIBUJO: Record<DibujoPaso, ReactNode> = {
  // Añadir un bloque: un hueco punteado con su «+».
  bloque: (
    <>
      {pagina}
      <rect x="17" y="27" width="86" height="18" rx="3" fill="none" stroke="currentColor" strokeOpacity=".7" strokeDasharray="3 2" />
      <path d="M57 36h6M60 33v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  // Añadir un botón de su web.
  boton: (
    <>
      {pagina}
      <rect x="17" y="30" width="40" height="12" rx="6" fill="none" stroke="currentColor" strokeOpacity=".7" strokeDasharray="3 2" />
      <path d="M34 36h6M37 33v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  // Pegar el código.
  pegar: codigo(15),
  // Pegar el enlace en el botón: el botón y un eslabón.
  enlace: (
    <>
      {pagina}
      <rect x="17" y="30" width="40" height="12" rx="6" fill="currentColor" fillOpacity=".8" />
      <rect x="66" y="31" width="14" height="9" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="74" y="31" width="14" height="9" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  // Guardar, actualizar o publicar: el botón de arriba a la derecha, marcado.
  publicar: (
    <>
      <rect x="10" y="5" width="100" height="46" rx="4" fill="none" stroke="currentColor" strokeOpacity=".45" />
      <rect x="17" y="14" width="44" height="4" rx="2" fill="currentColor" fillOpacity=".25" />
      <rect x="17" y="24" width="60" height="3" rx="1.5" fill="currentColor" fillOpacity=".2" />
      <rect x="74" y="10" width="30" height="11" rx="3" fill="currentColor" fillOpacity=".85" />
      <path d="M92 19l3 9 2-3.5 3.5-1.5z" fill="currentColor" stroke="var(--card)" strokeOpacity=".6" strokeWidth=".6" />
    </>
  ),
  // Mirarlo en la web publicada: una ventana con su ✓.
  comprobar: (
    <>
      <rect x="10" y="5" width="100" height="46" rx="4" fill="none" stroke="currentColor" strokeOpacity=".45" />
      <line x1="10" x2="110" y1="13" y2="13" stroke="currentColor" strokeOpacity=".35" />
      <circle cx="16" cy="9" r="1.5" fill="currentColor" fillOpacity=".4" />
      <circle cx="21" cy="9" r="1.5" fill="currentColor" fillOpacity=".4" />
      <rect x="17" y="20" width="50" height="4" rx="2" fill="currentColor" fillOpacity=".25" />
      <rect x="17" y="29" width="40" height="3" rx="1.5" fill="currentColor" fillOpacity=".2" />
      <circle cx="88" cy="33" r="9" fill="currentColor" fillOpacity=".8" />
      <path d="M84 33l3 3 5-6" fill="none" stroke="var(--card)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // La línea <script> en el pie del tema: la página y el código abajo del todo.
  script: (
    <>
      <rect x="10" y="5" width="100" height="46" rx="4" fill="none" stroke="currentColor" strokeOpacity=".45" />
      <rect x="17" y="11" width="34" height="4" rx="2" fill="currentColor" fillOpacity=".3" />
      <rect x="10" y="34" width="100" height="17" rx="0" fill="currentColor" fillOpacity=".7" />
      <path d="M22 39l-4 3.5 4 3.5M30 39l4 3.5-4 3.5" fill="none" stroke="var(--card)" strokeOpacity=".7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="40" y="41" width="46" height="3" rx="1.5" fill="var(--card)" fillOpacity=".35" />
    </>
  ),
  // Pulsar «Copiar»: dos hojas.
  copiar: (
    <>
      <rect x="44" y="8" width="26" height="32" rx="3" fill="none" stroke="currentColor" strokeOpacity=".5" />
      <rect x="52" y="16" width="26" height="32" rx="3" fill="currentColor" fillOpacity=".8" />
    </>
  ),
  // Pegarlo en Instagram, WhatsApp o un correo: un móvil con un mensaje.
  compartir: (
    <>
      <rect x="44" y="3" width="32" height="50" rx="6" fill="none" stroke="currentColor" strokeOpacity=".5" />
      <rect x="49" y="12" width="20" height="9" rx="4" fill="currentColor" fillOpacity=".25" />
      <rect x="52" y="25" width="19" height="9" rx="4" fill="currentColor" fillOpacity=".8" />
      <rect x="55" y="28.5" width="12" height="2" rx="1" fill="var(--card)" fillOpacity=".6" />
    </>
  ),
};

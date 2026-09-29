'use client';

// El segmentado de la app de la alumna («Próximas · Fijas · Historial» en Mis
// clases), ADAPTADO para /reservar y el widget nativo (F5 del rediseño,
// 29-sep-2026): una pista rellena y una píldora que se desliza hasta la opción
// elegida. Lo usan «Mis reservas» (Próximas / Pasadas), «Mi cuenta» (Bonos /
// Perfil) y las dos caras del widget «Mi cuenta» incrustado.
//
// ⚠️ Solo estilos EN LÍNEA: esto también lo compila esbuild para el widget
// nativo (app/widget-bundle/main.tsx), que no tiene Tailwind.
//
// Botones con `aria-pressed` dentro de un `role="group"`, y no un `tablist`: es
// lo que ya eran, y lo que buscan los e2e (`getByRole('button', …)`). Un
// `tablist` a medias —sin flechas ni `tabpanel`— sería peor que esto.
//
// El anillo de foco es `reservar-foco` (app/globals.css), el de la cabecera y
// la portada de /reservar. No es una clase nueva: en el nativo, que no la
// tiene, queda el anillo del navegador, que también se ve.

import type { ModoTokens } from '@/lib/portal-modo';
import { paletaOscura, sans } from '@/lib/reservar-publico-tokens';

/** El muelle del segmentado de la app (`--ease-spring`): llega, se pasa un pelo y vuelve. */
const MUELLE = 'cubic-bezier(.34,1.3,.5,1)';

export interface OpcionSegmentado<T extends string> {
  id: T;
  label: string;
}

export function Segmentado<T extends string>({ t, opciones, valor, onCambiar, etiqueta, anchoMaximo }: {
  t: ModoTokens;
  opciones: readonly OpcionSegmentado<T>[];
  valor: T;
  onCambiar: (id: T) => void;
  /** El nombre del grupo para el lector de pantalla («Próximas o pasadas»). */
  etiqueta: string;
  anchoMaximo?: number;
}) {
  const n = Math.max(1, opciones.length);
  const i = Math.max(0, opciones.findIndex(o => o.id === valor));
  // La píldora elegida tiene que destacar de la pista en los dos sentidos. En
  // claro es la tarjeta sobre el relleno, con su sombra (lo de la app). En
  // oscuro la tarjeta es MÁS oscura que el relleno —la píldora parecería un
  // hueco— y la sombra no se ve: se aclara con la propia tinta.
  const oscura = paletaOscura(t);
  return (
    <div
      role="group"
      aria-label={etiqueta}
      style={{
        position: 'relative', display: 'flex', width: '100%', maxWidth: anchoMaximo,
        padding: 3, borderRadius: 'var(--reservar-radio-boton, 999px)', background: t.surface2,
        fontFamily: sans,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: 3, bottom: 3, left: 3, width: `calc((100% - 6px) / ${n})`,
          borderRadius: 'var(--reservar-radio-boton, 999px)',
          background: oscura ? `color-mix(in oklab, ${t.ink} 14%, ${t.surface})` : t.surface,
          boxShadow: oscura ? 'none' : '0 3px 10px rgba(26,26,26,.1), 0 1px 2px rgba(26,26,26,.06)',
          transform: `translateX(${i * 100}%)`,
          transition: `transform .32s ${MUELLE}`,
        }}
      />
      {opciones.map(o => {
        const elegida = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={elegida}
            onClick={() => onCambiar(o.id)}
            className="reservar-foco"
            style={{
              // 44 de alto: lo que se toca con el pulgar (el de la app medía 34
              // y lo compensaba con una zona táctil invisible que aquí, en
              // línea, no se puede pintar).
              flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '0 10px', position: 'relative',
              border: 'none', background: 'none', borderRadius: 'var(--reservar-radio-boton, 999px)', cursor: 'pointer',
              fontFamily: sans, fontSize: 13, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
              // `muted` y no la tinta suave: calibrado contra la pista (el
              // relleno), que es donde está el texto de las no elegidas.
              color: elegida ? t.ink : t.muted,
              transition: 'color .25s ease',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

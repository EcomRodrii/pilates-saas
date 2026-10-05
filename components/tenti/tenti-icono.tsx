'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Tenti a tamaño de icono: el mismo dibujo que el canvas, quieto y en SVG.
//
// Portado del prototipo web de Coucou (design/prototype/notch-buddy.html),
// cuyo personaje Tentare usa con autorización escrita de su autor (5-oct-2026).
// El código de Coucou es MIT:
//
//   Copyright (c) 2026 Louis Raillé
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or
//   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
//   WITHOUT WARRANTY OF ANY KIND.
//
// Es la marca de «aquí interviene Tentare» en las pantallas de todos los días,
// donde antes iba el Orb. Por eso NO es el canvas: sin requestAnimationFrame,
// sin el motor en el chunk de la pantalla (ni sus sonidos) y sin JavaScript que
// correr después de pintarse. El dibujo sale de lib/tenti/geometria.ts, la
// misma geometría que anima el motor, y el tema lo cambia el CSS: los colores
// son los tokens --tenti-* de app/globals.css, que .dark redefine.
//
// Dos estados, y ninguno más:
//   · 'reposo' — la firma. Quieto del todo. No es un aviso ni un «todo bien»:
//     si hay algo que avisar, lo dice el texto de al lado.
//   · 'pensando' — una petición de verdad en vuelo (un botón de IA, Analizar),
//     siempre junto a un gerundio en el texto. Es la MISMA pose respirando por
//     CSS (`tenti-respira`, globals.css), no la del canvas, que mira arriba a la
//     derecha como un asistente que piensa. Con «reducir movimiento» se queda
//     quieto, y el estado lo dice el texto.
//
// Siempre aria-hidden: va pegado a un texto que ya dice lo mismo, y su nombre
// no puede colarse en el del botón o el enlace que lo lleva. Por eso no acepta
// `titulo`.
//
// 'use client' es por useId(): hay varios Tentis por página (tres en Resumen,
// dos en Automatizaciones), y con ids fijos los url(#…) de los degradados
// resolverían todos al primero (mismo motivo que LogoTentare).
//
// Dónde puede ir lo decide la guardia lib/tenti/donde-vive-tenti.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { SILUETA_PX, dibujoDelIcono } from '@/lib/tenti/geometria';

/** Anchos cerrados. Por debajo de 18 los ojos miden menos de 2 px y a DPR 1 se
 *  leen como manchas: el 16 no existe a propósito. */
export type AnchoTentiIcono = 18 | 20 | 22 | 24 | 28;
export type EstadoTentiIcono = 'reposo' | 'pensando';
/** `invertida`: la superficie de debajo es la tinta del texto (bg-primary,
 *  bg-brand). En oscuro --primary es casi el color del cuerpo (1,34:1), así que
 *  ahí la silueta toma el color del texto de esa superficie (currentColor). */
export type SuperficieTentiIcono = 'normal' | 'invertida';

export interface PropsTentiIcono {
  /** Ancho del dibujo en px; el alto sale de la proporción del cuerpo. */
  ancho: AnchoTentiIcono;
  estado?: EstadoTentiIcono;
  sobre?: SuperficieTentiIcono;
  className?: string;
}

// Una vez por módulo: el dibujo no depende de nada.
const D = dibujoDelIcono();

export function TentiIcono({ ancho, estado = 'reposo', sobre = 'normal', className }: PropsTentiIcono) {
  const propio = useId();
  const id = (n: string) => `tenti-${n}-${propio}`;
  return (
    <svg
      data-tenti-icono=""
      data-estado={estado}
      aria-hidden="true"
      focusable="false"
      viewBox={D.viewBox}
      width={ancho}
      height={Math.round(ancho * D.proporcion * 100) / 100}
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={id('cuerpo')} gradientUnits="userSpaceOnUse" {...D.degradado}>
          <stop offset="0" stopColor="var(--tenti-cuerpo-luz)" />
          <stop offset="1" stopColor="var(--tenti-cuerpo-sombra)" />
        </linearGradient>
        {/* El volumen: un radial de dos círculos, como el del canvas (fx/fy/fr
            es el círculo de partida). */}
        <radialGradient
          id={id('volumen')} gradientUnits="userSpaceOnUse"
          cx={D.volumen.cx} cy={D.volumen.cy} r={D.volumen.r} fx={D.volumen.fx} fy={D.volumen.fy} fr={D.volumen.fr}
        >
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset={D.volumen.desde} stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity={D.volumen.opacidad} />
        </radialGradient>
        <radialGradient id={id('brillo')} gradientUnits="userSpaceOnUse" cx={D.brillo.cx} cy={D.brillo.cy} r={D.brillo.r}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={D.brillo.opacidad} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('recorte')}>
          <path d={D.cuerpo} />
        </clipPath>
      </defs>
      <path d={D.cuerpo} fill={`url(#${id('cuerpo')})`} />
      <path d={D.cuerpo} fill={`url(#${id('volumen')})`} />
      <path d={D.cuerpo} fill={`url(#${id('brillo')})`} />
      {/* La silueta, POR DENTRO: el trazo es el doble de ancho y el recorte se
          come la mitad de fuera. Así no se sale del viewBox ceñido, y con
          non-scaling-stroke mide lo mismo a 18 que a 28 px. */}
      <path
        d={D.cuerpo}
        fill="none"
        stroke={sobre === 'invertida' ? 'currentColor' : 'var(--tenti-silueta)'}
        strokeWidth={2 * SILUETA_PX}
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${id('recorte')})`}
      />
      {D.mofletes.map((m) => (
        <ellipse key={m.cx} cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry} fill="var(--tenti-rubor)" fillOpacity={D.opacidadMofletes} />
      ))}
      {D.ojos.map((o) => (
        <rect key={o.x} x={o.x} y={o.y} width={o.ancho} height={o.alto} rx={o.rx} ry={o.ry} fill="var(--tenti-tinta)" />
      ))}
    </svg>
  );
}

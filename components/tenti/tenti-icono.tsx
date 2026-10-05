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
// donde antes iba el Orb. Desde el 5-oct-2026 (decisión del fundador: «no se
// mueve en ningún lado») va VIVO: el canvas del motor, el mismo que en
// /interno/tenti, a tamaño de icono. Parpadea, mira alrededor y sigue el cursor
// con los ojos, y si no va dentro de un botón o un enlace se deja tocar: se aplasta y suena, se molesta
// si insistes y se marea si insistes mucho. Dentro de un botón o un enlace el
// clic es del botón: ahí no es tocable ni suena por su cuenta.
//
// El motor llega en su propio chunk (el mismo que el del buscador y Listo, por
// dynamic()): ninguna pantalla lo lleva en su chunk inicial. Mientras llega, si
// no llega o si no hay canvas 2D, se ve el SVG quieto de siempre, en la MISMA
// caja (ancho × alto del cuerpo): nada salta.
//
// El canvas es más grande que la caja (el cuerpo ocupa el 68,4 % de su lado) y
// se sale de ella por arriba y por los lados, centrado en el cuerpo: así el
// cuerpo mide `ancho`, como el icono, y la pantalla no se mueve un píxel.
//
// Sus estados (desde el 5-oct-2026 por la noche, fundador: «que use todos sus
// estados y emociones, cada uno en su momento»): cada uno significa UNA cosa, y
// cada sitio lo pide a una función de lib/tenti/momentos.ts con el dato que lo
// decide (`MAPA`). Fuera quedan 'buscando' (el asistente) y 'mareado' (solo al
// tocarlo). Dos que conviene recordar:
//   · 'reposo' — la firma. No es un aviso ni un «todo bien»: si hay algo que
//     avisar, lo dice el texto de al lado.
//   · 'pensando' — una petición de verdad en vuelo (un botón de IA, Analizar),
//     siempre junto a un gerundio en el texto. Es el 'pensando' del motor (mira
//     arriba a la derecha, sin la insignia de puntos), y además respira por CSS
//     (`tenti-respira`, globals.css) mientras dura la petición.
//     Empezar a pensar no suena; terminar con resultado lo suena quien llama
//     (`sonarTenti('pop')`), porque solo él sabe si hubo resultado.
// Lo que describe una situación (espera tu visto bueno, dormido…) oscila como
// mucho 4 s y se queda en su pose (`movimiento`, lib/tenti/motor.ts). Los
// cambios de estado no suenan salvo con `sonarCambios`, y dentro de un control
// nunca. Las emociones, una vez por `clave` y en silencio.
// Con «reducir movimiento», quieto (sin respirar, parpadear ni mirar).
// En reposo no respira, como en el catálogo: medido, una respiración CSS sin fin
// en cada icono costaba más hilo principal que los tres canvas juntos.
//
// Siempre aria-hidden: va pegado a un texto que ya dice lo mismo, y su nombre
// no puede colarse en el del botón o el enlace que lo lleva. Por eso no acepta
// `titulo`.
//
// El traje de temporada (el gorro de bruja, lib/tenti/trajes.ts) lo lleva solo
// donde se toca: dentro de un botón o un enlace, no. Así quedan fuera sin otra
// lista los botones de IA que tratan salud (un disfraz junto a la lesión de una
// alumna es frívolo) y los enlaces pequeños, donde el gorro compite con la
// etiqueta. El SVG de reserva lleva el mismo gorro (lib/tenti/geometria.ts),
// que se sale de la caja por arriba como el canvas: la caja no cambia.
//
// useId(): hay varios Tentis por página (tres en Resumen), y con ids fijos los
// url(#…) de los degradados del SVG resolverían todos al primero.
//
// Dónde puede ir lo decide la guardia lib/tenti/donde-vive-tenti.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic';
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BAJADA, LADO_MINIMO_BANDA, R_DEL_LADO, SEMIEJE_X, SILUETA_PX, dibujoDelIcono, dibujoDelTraje } from '@/lib/tenti/geometria';
import { useTrajeDeTenti } from '@/lib/tenti/preferencia-traje';
import type { Traje } from '@/lib/tenti/trajes';
import type { PropsTenti } from './tenti';

/** Anchos cerrados. Por debajo de 18 los ojos miden menos de 2 px y a DPR 1 se
 *  leen como manchas: el 16 no existe a propósito. */
export type AnchoTentiIcono = 18 | 20 | 22 | 24 | 28;
export type EstadoTentiIcono =
  | 'reposo' | 'pensando' | 'trabajando' | 'hecho' | 'error' | 'esperaTuOk' | 'pregunta' | 'agobiado' | 'dormido';
/** Las emociones que el icono puede tener; 'feliz' es del logo guardado y
 *  'molesto' solo sale al tocarlo. */
export type EmocionTentiIcono = 'amor' | 'orgullo' | 'guino' | 'bostezo' | 'sorpresa';
/** `invertida`: la superficie de debajo es la tinta del texto (bg-primary,
 *  bg-brand). En oscuro --primary es casi el color del cuerpo (1,34:1), así que
 *  ahí la silueta toma el color del texto de esa superficie (currentColor). */
export type SuperficieTentiIcono = 'normal' | 'invertida';

export interface PropsTentiIcono {
  /** Ancho del dibujo en px; el alto sale de la proporción del cuerpo. */
  ancho: AnchoTentiIcono;
  estado?: EstadoTentiIcono;
  sobre?: SuperficieTentiIcono;
  /** Una vez por `clave`, sin sonido y cuando ya se ve. */
  emocion?: { tipo: EmocionTentiIcono; clave: string } | null;
  /** 'hecho' con celebración (los hitos) en vez de breve. */
  celebra?: boolean;
  /** Sus cambios de estado suenan (y el estado con el que aparece). Dentro de un control, nunca. */
  sonarCambios?: boolean;
  className?: string;
}

// Una vez por módulo: el dibujo no depende de nada.
const D = dibujoDelIcono();

/** El lado del canvas para que el CUERPO mida `ancho`: el cuerpo ocupa
 *  2·SEMIEJE_X·R_DEL_LADO (0,684) del lado. Redondeado a px enteros. */
function ladoDelCanvas(ancho: AnchoTentiIcono): number {
  return Math.round(ancho / (2 * SEMIEJE_X * R_DEL_LADO));
}

/** Dónde va el canvas respecto a la caja del icono: centrado en el cuerpo, que
 *  en el canvas baja BAJADA·R del centro. Enteros, para no pintar a medio píxel. */
function encajeDelCanvas(ancho: AnchoTentiIcono): { lado: number; izquierda: number; arriba: number } {
  const lado = ladoDelCanvas(ancho);
  const alto = ancho * D.proporcion;
  return {
    lado,
    izquierda: Math.round((ancho - lado) / 2),
    arriba: Math.round(alto / 2 - lado * (0.5 + R_DEL_LADO * BAJADA)),
  };
}

const ReservaCtx = createContext<ReactNode>(null);

function SoloReserva(): ReactNode {
  return useContext(ReservaCtx);
}

const TentiCanvas = dynamic<PropsTenti>(
  () => import('./tenti').then((m) => m.Tenti).catch(() => SoloReserva),
  { ssr: false, loading: () => <SoloReserva /> },
);

/** Lo que hace de un sitio «el clic es de otro»: ahí Tenti no se toca. */
const DENTRO_DE_UN_CONTROL = 'a, button, label, summary, [role="button"], [role="link"], [role="switch"], [role="menuitem"], [role="tab"]';

export function TentiIcono({
  ancho, estado = 'reposo', sobre = 'normal', emocion = null, celebra = false, sonarCambios = false, className,
}: PropsTentiIcono) {
  const caja = useRef<HTMLSpanElement>(null);
  // Se sabe después de montar (hay que mirar el DOM): hasta entonces, no tocable.
  const [tocable, setTocable] = useState(false);
  useEffect(() => {
    setTocable(!caja.current?.closest(DENTRO_DE_UN_CONTROL));
  }, []);
  const deTemporada = useTrajeDeTenti();
  const traje = tocable ? deTemporada : null;
  const alto = Math.round(ancho * D.proporcion * 100) / 100;
  const { lado, izquierda, arriba } = encajeDelCanvas(ancho);
  // El SVG quieto vuelve a la caja desde la del canvas.
  const reserva = (
    <span className="absolute" style={{ left: -izquierda, top: -arriba, width: ancho, height: alto }}>
      <SvgTenti ancho={ancho} alto={alto} sobre={sobre} traje={traje} />
    </span>
  );
  return (
    <span
      ref={caja}
      data-tenti-icono=""
      data-estado={estado}
      data-traje={traje ?? undefined}
      aria-hidden="true"
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: ancho, height: alto }}
    >
      <span
        className={cn('absolute', !tocable && 'pointer-events-none')}
        style={{ left: izquierda, top: arriba, width: lado, height: lado }}
      >
        <ReservaCtx.Provider value={reserva}>
          <TentiCanvas
            estado={estado}
            tamano={lado}
            silueta={sobre}
            // Fuera de un botón suena al tocarlo y al saludar; dentro, nunca por
            // su cuenta (empezar a pensar no suena: ver arriba).
            sonido={tocable ? undefined : false}
            sigueCursor
            interactivo={tocable}
            saludaUnaVez={tocable}
            // El traje, solo donde se toca: la misma regla.
            conTraje={tocable}
            celebra={celebra}
            sonarCambios={tocable && sonarCambios}
            emocion={emocion}
            reserva={reserva}
            className="block"
          />
        </ReservaCtx.Provider>
      </span>
    </span>
  );
}

/** El dibujo quieto, en SVG: la reserva mientras llega el motor o si no puede pintarse. */
function SvgTenti({ ancho, alto, sobre, traje }: { ancho: AnchoTentiIcono; alto: number; sobre: SuperficieTentiIcono; traje: Traje | null }) {
  const propio = useId();
  const id = (n: string) => `tenti-${n}-${propio}`;
  const silueta = sobre === 'invertida' ? 'currentColor' : 'var(--tenti-silueta)';
  return (
    <svg
      data-tenti-svg=""
      aria-hidden="true"
      focusable="false"
      viewBox={D.viewBox}
      width={ancho}
      height={alto}
      className="block"
      // El gorro se sale del viewBox ceñido por arriba, como el canvas de la caja.
      style={traje ? { overflow: 'visible' } : undefined}
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
        stroke={silueta}
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
      {traje && <GorroSvg traje={traje} silueta={silueta} banda={ladoDelCanvas(ancho) >= LADO_MINIMO_BANDA} id={id} />}
    </svg>
  );
}

/** El traje en SVG, en la pose de reposo: el mismo dibujo y el mismo orden que
 *  el canvas (lib/tenti/motor.ts): sin banda donde el lienzo no llega a
 *  LADO_MINIMO_BANDA, y sin hebilla, porque el icono es siempre mini. */
function GorroSvg({ traje, silueta, banda, id }: { traje: Traje; silueta: string; banda: boolean; id: (n: string) => string }) {
  const g = dibujoDelTraje(traje);
  const giro = `rotate(${g.ala.giro} ${g.ala.cx} ${g.ala.cy})`;
  const trazo = { stroke: silueta, strokeWidth: 2 * SILUETA_PX, vectorEffect: 'non-scaling-stroke' } as const;
  // La silueta POR FUERA (el trazo debajo del relleno), como en el canvas.
  return (
    <g data-gorro={traje}>
      <defs>
        <clipPath id={id('cono')}><path d={g.cono} /></clipPath>
      </defs>
      <path d={g.cono} fill="var(--tenti-traje-a)" {...trazo} paintOrder="stroke" />
      {banda && <path d={g.banda} fill="var(--tenti-traje-b)" clipPath={`url(#${id('cono')})`} />}
      <ellipse cx={g.ala.cx} cy={g.ala.cy} rx={g.ala.rx} ry={g.ala.ry} transform={giro} fill="var(--tenti-traje-a)" {...trazo} paintOrder="stroke" />
    </g>
  );
}

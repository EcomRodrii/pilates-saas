'use client';

import { useState, type CSSProperties } from 'react';
import { urlServida, srcSetServido, srcSetPorAncho } from '@/lib/student/imagen-servida';

// La única `<img>` de fotos de la app de la alumna.
//
// Existe porque las nueve que había repartidas compartían los mismos tres
// olvidos, y repetirlos es lo que los hace invisibles:
//
//  1. **Sin `decoding="async"`**. Una foto se descodifica en el HILO PRINCIPAL,
//     el mismo que dibuja el scroll. Con una imagen de 1600 px eso es decenas
//     de milisegundos de tirón justo al abrir la pantalla.
//  2. **Sin ancho ni alto**. El navegador no puede reservar el hueco, así que la
//     página SALTA cuando cada foto entra.
//  3. **Al tamaño en que se subió** (1280-1600 px) y no en el que se ve (132 a
//     393 px). Ver `lib/student/imagen-servida.ts`.
//
// ⚠️ **El `alt` es SIEMPRE vacío y no se puede pasar.** Las nueve son
// decorativas: van detrás de un velo, bajo un texto que ya cuenta lo mismo, o
// como fondo de una tarjeta cuyo título está al lado. Un `alt` describiendo
// «foto del estudio» le hace oír ruido a quien usa lector de pantalla. Si algún
// día hace falta una foto que SÍ informe, es otro componente, no un parámetro.

export interface FotoProps {
  src: string;
  /** Ancho del hueco en px CSS, para pedir la imagen a ese tamaño. */
  ancho: number;
  /** Alto del hueco. Con `ancho`, reserva el sitio y evita el salto. */
  alto: number;
  /**
   * Se ve sin desplazarse (los héroes). Carga pronto y con prioridad, en vez de
   * diferida: un `loading="lazy"` en la imagen más grande de la primera pantalla
   * RETRASA lo que el usuario vino a ver.
   */
  prioritaria?: boolean;
  /**
   * Cuánto mide el hueco en cada tamaño de pantalla, p.ej.
   * `'(min-width:1024px) 1040px, 100vw'`.
   *
   * ⚠️ **Obligatorio en toda imagen que ocupe el ancho disponible.** Sin él se
   * usan densidades, y con densidades el navegador elige `3x` de lo declarado:
   * un héroe que mide 390 px en el móvil y 1040 en escritorio no se puede
   * describir con un solo número. Omitir esto es lo que hacía que un iPhone
   * bajara la imagen de 1600 px para un hueco de 390.
   */
  sizes?: string;
  style?: CSSProperties;
  className?: string;
}

export function Foto({ src, ancho, alto, prioritaria = false, sizes, style, className }: FotoProps) {
  // ⚠️ Red de seguridad: si el endpoint que redimensiona fallara (un plan sin
  // esa función, un objeto recién subido que aún no se ha propagado), se vuelve
  // a la URL original en vez de dejar un hueco. Una foto grande se ve; una foto
  // rota, no.
  const [crudo, setCrudo] = useState(false);
  const srcSet = crudo ? undefined : (sizes ? srcSetPorAncho(src) : srcSetServido(src, ancho)) ?? undefined;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Storage sirve el redimensionado; `next/image` lo re-serviría por su optimizador y perdería el `?v=` que rompe la caché
    <img
      src={crudo ? src : urlServida(src, ancho)}
      srcSet={srcSet}
      sizes={srcSet && sizes ? sizes : undefined}
      alt=""
      width={ancho}
      height={alto}
      decoding="async"
      loading={prioritaria ? 'eager' : 'lazy'}
      fetchPriority={prioritaria ? 'high' : undefined}
      onError={() => setCrudo(true)}
      className={className}
      style={style}
    />
  );
}

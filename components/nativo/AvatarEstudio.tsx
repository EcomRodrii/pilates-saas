'use client';

import { useState, type CSSProperties } from 'react';
import { monogramaDeEstudio } from '@/lib/monograma-estudio';

/**
 * El icono de un estudio en la entrada de la app de iOS: el buscador, la lista
 * de sus estudios y la ficha. Siempre el MISMO icono (`/icono-estudio`, el que
 * calcula `marcaDelEstudio`: su favicon › su logo › su inicial), y debajo, ya
 * pintada, su inicial sobre el color de su tema.
 *
 * Por qué la inicial debajo: el icono es un PNG que se genera en el servidor la
 * primera vez que alguien lo pide (y para el favicon de un estudio baja antes su
 * imagen de Storage). Hasta que llegaba, o si no llegaba, el hueco del avatar se
 * quedaba vacío, sin borde, sobre una tarjeta del mismo color: parecía que el
 * estudio no tenía icono. Ahora ese rato se ve su inicial, que es justo lo que
 * enseña el PNG cuando el estudio no ha subido nada (`monogramaDeEstudio` sigue
 * las mismas reglas), así que no hay salto. Si la imagen falla, se queda la
 * inicial.
 *
 * El aro de 1 px: un icono sobre blanco (el favicon se prepara así al subirlo)
 * en una tarjeta blanca no tenía borde y se leía como un hueco.
 */
export function AvatarEstudio({ icono, nombre, color, lado, radio, style }: {
  icono: string;
  nombre: string;
  /** El color de su tema; sin él (o inválido), el oliva de siempre, como el PNG. */
  color?: string | null;
  lado: number;
  radio: number;
  style?: CSSProperties;
}) {
  const { inicial, fondo, texto } = monogramaDeEstudio(nombre, color);
  // La URL con la que falló: si cambia el icono, se vuelve a intentar.
  const [fallo, setFallo] = useState<string | null>(null);
  return (
    <span
      aria-hidden="true"
      data-avatar-estudio=""
      style={{
        position: 'relative', flexShrink: 0, overflow: 'hidden',
        width: lado, height: lado, borderRadius: radio,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: fondo, color: texto,
        // Peso normal y al 50 %: como la letra del PNG, para que no salte al llegar.
        fontWeight: 400, fontSize: Math.round(lado * 0.5), lineHeight: 1,
        boxShadow: '0 0 0 1px var(--border)',
        ...style,
      }}
    >
      {inicial}
      {fallo !== icono && (
        // eslint-disable-next-line @next/next/no-img-element -- icono servido por nuestra propia ruta
        <img
          src={icono}
          alt=""
          width={lado}
          height={lado}
          decoding="async"
          onError={() => setFallo(icono)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </span>
  );
}

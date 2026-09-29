'use client';

// La portada de la página suelta /reservar/[slug] (F3 del rediseño «/reservar
// = estilo de la app de la alumna», 29-sep-2026).
//
// Antes: dos columnas —titular, subtítulo y botón a un lado, la foto en una
// tarjeta 4:3 al otro— bajo una barra aparte. En escritorio medía ~620 px y el
// horario empezaba por debajo del pliegue; en el móvil, titular + subtítulo +
// botón + foto apilados empujaban la primera clase fuera de la pantalla.
//
// Ahora: la cabecera de la app de la alumna. La foto del estudio es el FONDO,
// a sangre, con su velo; la barra de la marca flota encima y el titular va
// debajo, en la misma columna que el horario. Mide la mitad (~240 px en el
// móvil, ~290 en escritorio) y al abrir se ve la tira de días y la primera
// clase, que es a lo que viene la gente — lo vigila
// e2e/reservar-portada-cabecera.spec.ts a 1280×800 y a 390×844.
//
// ⚠️ Los textos son los del estudio (`reservarTitular`, `reservarSubtitulo`,
// `reservarCta` de su tema) y vacíos dejan los de siempre. Aquí no se escribe
// copy de marca.

import type { ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';
import { cq, pesoTitular, sans, serif } from '@/lib/reservar-publico-tokens';
import {
  ANCHO_PAGINA, COLUMNA_HORARIO, FONDO_SIN_FOTO, TINTA_SOBRE_CREMA, TINTA_SOBRE_FOTO, veloPortadaCss,
} from '@/lib/reservar/portada';
import { MARGEN_PAGINA } from '@/components/reservar/cabecera-reservar';

export function PortadaReservar({ foto, titular, subtitulo, cta, onCta, cabecera }: {
  /** `null` mientras no se sabe qué foto es (el estudio aún no ha llegado): mejor el fondo oscuro que la de por defecto y un salto a la suya. */
  foto: string | null;
  titular: string;
  subtitulo: string | null;
  cta: string;
  onCta: () => void;
  /** La barra de la marca, que flota sobre la foto. */
  cabecera: ReactNode;
}) {
  return (
    <div
      className="reservar-portada"
      style={{
        position: 'relative', overflow: 'hidden',
        background: FONDO_SIN_FOTO, color: TINTA_SOBRE_FOTO,
        // El anillo de foco de todo lo que va encima: crema sobre el velo.
        ['--reservar-foco' as string]: TINTA_SOBRE_FOTO,
      }}
    >
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          // `reserva-hero-foto`: la clase de siempre, la cuenta
          // e2e/widget-contacto.spec.ts para no pintar la foto dos veces.
          className="reserva-hero-foto"
          src={foto}
          alt=""
          // Es lo más grande de la primera pantalla (su LCP) en una página que
          // se indexa. Sin fundido a propósito: un `opacity: 0` de partida la
          // saca del cálculo del LCP, y bajo el velo el salto apenas se ve.
          fetchPriority="high"
          onError={alFallarImagen(IMAGENES_POR_DEFECTO.portada[0])}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 40%',
          }}
        />
      )}
      {/* El velo: ver lib/reservar/portada.ts — ninguna parada baja del mínimo
          que garantiza AA sobre un píxel blanco. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: veloPortadaCss() }} />

      <div style={{ position: 'relative' }}>
        {cabecera}
        <div style={{ maxWidth: ANCHO_PAGINA, marginInline: 'auto', padding: `${cq(10, 1.6, 20)} ${MARGEN_PAGINA} ${cq(24, 3.4, 44)}` }}>
          {/* La misma columna que el horario de debajo: el titular y la
              primera clase empiezan en el mismo borde. */}
          <div style={{ maxWidth: COLUMNA_HORARIO, marginInline: 'auto' }}>
            {/* Peso de titular de la pareja tipográfica (800 con «Moderna»),
                como el héroe de la app — antes iba fino (`normal`) porque era
                enorme; a este tamaño, fino y sobre una foto se perdía. */}
            <h1 style={{
              margin: 0, fontFamily: serif, fontWeight: pesoTitular(800),
              fontSize: cq(28, 3.6, 44), lineHeight: 1.06, letterSpacing: '-.02em',
              textWrap: 'balance', overflowWrap: 'break-word',
            }}>
              {titular}
            </h1>
            {/* Dos líneas como mucho: puede ser la descripción del estudio, que
                a veces es un párrafo, y aquí solo presenta. Entera está en «El
                estudio». Crema entero y no atenuado: la jerarquía la marca el
                tamaño (ver el test de contraste). */}
            {subtitulo && (
              <p style={{
                margin: '8px 0 0', maxWidth: 540,
                fontFamily: sans, fontSize: cq(14, 1.3, 16), fontWeight: 500, lineHeight: 1.45,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {subtitulo}
              </p>
            )}
            {/* Lleva al horario, que empieza justo debajo: en el móvil lo sube
                entero a la vista y deja el foco en él (teclado y lector). */}
            <button
              type="button"
              onClick={onCta}
              className="reservar-boton reservar-foco"
              style={{
                marginTop: cq(14, 1.6, 20), height: 44, padding: '0 18px 0 20px', borderRadius: 999,
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: 'none', background: TINTA_SOBRE_FOTO, color: TINTA_SOBRE_CREMA,
                fontFamily: sans, fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 10px 24px -14px rgba(0,0,0,.6)',
              }}
            >
              {cta}
              <ArrowDown size={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

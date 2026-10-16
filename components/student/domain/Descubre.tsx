'use client';

import { useCallback, type CSSProperties, type ReactNode, type Ref } from 'react';
import Link from 'next/link';
import { useAsync } from '@/lib/student/useAsync';
import { getDescubre } from '@/lib/student/datos';
import { hoyISO } from '@/lib/student/formato';
import type { TarjetaDescubre } from '@/lib/student/descubre';
import { Foto } from '@/components/student/ui/Foto';

// «Descubre» — la fila de tarjetas con foto que publica el estudio.
//
// ⚠️ Si el estudio no ha publicado ninguna, esta sección NO SE PINTA. Ni
// título, ni estado vacío, ni «aquí no hay nada todavía». Es contenido
// opcional del estudio, no una pantalla de la app: un hueco con un cartel de
// «vacío» le dice a la alumna que le falta algo, cuando lo que pasa es que su
// estudio no usa esto. Mismo criterio que `DelEstudio` justo al lado.
//
// Se desplaza en horizontal a propósito: cuatro tarjetas apiladas en vertical
// empujarían «Huecos de hoy» —que es lo que sirve para reservar HOY— fuera de
// la pantalla. Cada tarjeta es una foto ancha (16:9) que deja asomar la siguiente.

/**
 * Una tarjeta: una foto ancha que ES la tarjeta, con su texto y su botón encima si el estudio
 * los escribió. Con enlace es un <a>; sin él, una figura que no promete nada.
 *
 * Si la foto ya trae su propio texto (un cartel de taller, como las que hacen en Canva), el
 * estudio deja el título vacío y la tarjeta es solo la foto: sin velo, sin letra encima y sin
 * botón repetido. Con título, el texto y el botón («Ver más», solo si lleva a alguna parte)
 * los pone la app, sobre un velo que sube desde abajo.
 *
 * Mide 16:9 como MÍNIMO y deja ver la siguiente por el borde derecho: que hay más se lee sin
 * tener que decirlo. El texto va en el flujo, no pegado a una caja fija: con un título largo o
 * con el «Texto más grande» del iPhone la tarjeta CRECE (y sus hermanas con ella) en vez de
 * comerse la primera línea. `unica` la ensancha al ancho entero, porque una sola tarjeta con un
 * hueco a la derecha parece rota.
 *
 * Exportada para la vista previa de «Contenido de tu app» en el panel, que pinta la
 * pieza de verdad: `marca` (una etiqueta encima, «La estás editando») y `resaltada`
 * solo los usa ella; la app no los pasa nunca.
 */
export function Tarjeta({ t, href, delay, marca, resaltada = false, unica = false }: {
  t: TarjetaDescubre; href: (p: string) => string; delay: number; marca?: ReactNode; resaltada?: boolean; unica?: boolean;
}) {
  const hayTexto = !!(t.titulo || t.texto);
  const contenido = (
    <>
      {/* La foto y su velo, recortados a la esquina. Van en su capa y no en la tarjeta: la
          tarjeta puede crecer con su texto y su anillo de foco no puede quedar recortado. */}
      <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' }}>
        <Foto
          src={t.imagenUrl}
          ancho={404}
          alto={227}
          sizes="(min-width: 480px) 404px, calc(100vw - 76px)"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Velo, solo si hay letra encima. El texto va en crema sobre una foto que sube el
            estudio, así que su legibilidad no puede depender de esa foto — mismo motivo, y
            misma forma, que el velo del héroe y el de la cabecera. Sube desde abajo, que es
            donde se apoya el texto, y cubre todo el ancho: un velo de izquierda a derecha
            dejaba el subtítulo sin protección sobre una foto blanca (una sala de Pilates).
            Sin texto, la foto va limpia: un velo sobre un cartel que ya trae su letra solo
            lo estropea. */}
        {hayTexto && (
          <span
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(8,8,8,.84) 0%, rgba(8,8,8,.68) 38%, rgba(8,8,8,.46) 72%, rgba(8,8,8,.32) 100%), linear-gradient(to right, rgba(8,8,8,.34), rgba(8,8,8,0) 72%)',
            }}
          />
        )}
      </span>
      {hayTexto && (
        <span style={{
          position: 'relative', display: 'flex', flexDirection: 'column', gap: 5, padding: 18, maxWidth: '88%',
          color: 'var(--on-dark)', textShadow: '0 1px 14px rgba(0,0,0,.5)',
        }}>
          {t.titulo && (
            <span style={{
              // La tipografía de títulos del estudio, como el «Descubre» de arriba: con una pareja
              // serif elegida en Apariencia, la tarjeta no puede quedarse en la sans.
              fontFamily: 'var(--font-heading, inherit)', fontWeight: 'var(--heading-weight, 800)',
              fontSize: 'calc(var(--t-h2, 21px) * 1.1 * var(--heading-scale, 1))', letterSpacing: 'var(--heading-tracking, -.02em)',
              lineHeight: 1.1, textWrap: 'balance', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{t.titulo}</span>
          )}
          {t.texto && (
            <span style={{ fontSize: 'var(--t-small, 14px)', lineHeight: 1.3, color: 'rgba(250,249,245,.94)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.texto}</span>
          )}
          {/* El botón solo si lleva a alguna parte. Ver `descubre.ts`: un enlace que no se
              pudo sanear deja la tarjeta sin destino, y un botón que no hace nada es una
              promesa rota. Es de adorno (la tarjeta entera es el enlace). Va en el color de la
              marca del estudio, con un filo claro por si ese color es oscuro y la foto también. */}
          {t.enlace && (
            <span
              aria-hidden
              style={{
                alignSelf: 'flex-start', marginTop: 7, padding: '9px 16px', borderRadius: 'var(--radius-pill, 999px)',
                background: 'var(--accent)', color: 'var(--accent-foreground, #FFFFFF)', fontSize: 'var(--t-small, 14px)', fontWeight: 800,
                letterSpacing: '-.005em', lineHeight: 1, textShadow: 'none', boxShadow: '0 0 0 1px rgba(255,255,255,.34), 0 6px 14px -6px rgba(0,0,0,.5)',
              }}
            >Ver más</span>
          )}
        </span>
      )}
      {marca ? (
        <span style={{
          position: 'absolute', top: 10, left: 10, zIndex: 1, padding: '3px 8px', borderRadius: 999,
          background: 'rgba(250,249,245,.94)', color: '#1A1A1A', fontSize: 11, fontWeight: 800, textShadow: 'none',
        }}>{marca}</span>
      ) : null}
    </>
  );

  const cuerpo: CSSProperties = {
    position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', flex: '1 1 auto', minWidth: 0,
    aspectRatio: '16 / 9', borderRadius: 'var(--radius-sheet, 24px)', background: '#0F0F0C', color: 'inherit', textDecoration: 'none',
    ...(resaltada ? { outline: '3px solid var(--accent)', outlineOffset: 2 } : null),
  };
  // Una foto sola, sin letra, que lleva a alguna parte: el enlace necesita un nombre.
  const nombre = t.titulo || t.texto || 'Ver más';

  return (
    <li className="a-up" style={{ flex: '0 0 auto', width: unica ? '100%' : 'calc(100% - 40px)', display: 'flex', scrollSnapAlign: 'start', animationDelay: `${delay}ms` }}>
      {!t.enlace ? (
        <div style={cuerpo}>{contenido}</div>
      ) : t.enlace.interno ? (
        // Los internos son rutas del portal («/reservar»), guardadas sin el
        // prefijo del estudio: se lo pone `href()`, que es quien sabe el slug.
        <Link href={href(t.enlace.valor)} aria-label={hayTexto ? undefined : nombre} className="tap" style={cuerpo}>
          {contenido}
        </Link>
      ) : (
        // Externo: pestaña nueva y `noopener` — la página de destino la elige
        // el estudio, no nosotros.
        <a href={t.enlace.valor} target="_blank" rel="noopener noreferrer" aria-label={hayTexto ? undefined : nombre} className="tap" style={cuerpo}>
          {contenido}
        </a>
      )}
    </li>
  );
}

/**
 * La fila que se desliza en horizontal. El desbordamiento sale del padre acolchado y llega al
 * borde de la pantalla: una fila que se corta a 18 px del borde no se lee como «sigue hacia la
 * derecha», se lee como recortada. Compartida con la vista previa del panel, para que se
 * vea EXACTAMENTE igual.
 */
export function FilaTarjetas({ children, filaRef }: { children: ReactNode; filaRef?: Ref<HTMLUListElement> }) {
  return (
    <ul
      ref={filaRef}
      className="no-scrollbar"
      style={{
        display: 'flex', gap: 12, margin: '-4px calc(var(--px) * -1)', padding: '6px var(--px)',
        listStyle: 'none', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollPaddingInline: 'var(--px)',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {children}
    </ul>
  );
}

export function Descubre({ slug, href }: { slug: string; href: (p: string) => string }) {
  const cargar = useCallback(() => getDescubre(slug, hoyISO()), [slug]);
  const { data, estado } = useAsync(cargar);

  // Ni esqueleto: se pide del mismo payload que el resto de la home, así que
  // aparecer «vacío y luego lleno» sería un parpadeo por nada.
  if (estado !== 'ready' || !data || data.length === 0) return null;

  return (
    <section aria-label="Descubre" data-testid="descubre">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
        <h2 className="t-h2">Descubre</h2>
      </div>
      <FilaTarjetas>
        {data.map((t, i) => <Tarjeta key={t.id} t={t} href={href} delay={i * 55} unica={data.length === 1} />)}
      </FilaTarjetas>
    </section>
  );
}

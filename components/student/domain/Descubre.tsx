'use client';

import { useCallback } from 'react';
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
// la pantalla.

/** Una tarjeta. Con enlace es un <a>; sin él, una figura que no promete nada. */
function Tarjeta({ t, href, delay }: { t: TarjetaDescubre; href: (p: string) => string; delay: number }) {
  const cuerpo = (
    <>
      <Foto
        src={t.imagenUrl}
        ancho={172}
        alto={194}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Velo. El texto va en crema sobre una foto que sube el estudio, así que
          su legibilidad no puede depender de esa foto — mismo motivo, y misma
          forma, que el velo del héroe y el de la cabecera. */}
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(8,8,8,.78), rgba(8,8,8,.45) 46%, rgba(8,8,8,.12) 78%, rgba(8,8,8,.04))',
        }}
      />
      <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, padding: 13, marginTop: 'auto', color: '#FAF9F5' }}>
        {t.titulo && (
          <span style={{ fontSize: 'var(--t-small)', fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.2 }}>{t.titulo}</span>
        )}
        {t.texto && (
          <span style={{ fontSize: 'var(--t-micro)', lineHeight: 1.3, color: 'rgba(250,249,245,.9)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.texto}</span>
        )}
        {/* El chevron solo si lleva a alguna parte. Ver `descubre.ts`: un
            enlace que no se pudo sanear deja la tarjeta sin destino, y una
            flecha que no hace nada es una promesa rota. */}
        {t.enlace && (
          <span
            aria-hidden
            style={{
              marginTop: 3, width: 24, height: 24, borderRadius: 999,
              background: 'rgba(250,249,245,.22)', border: '1px solid rgba(250,249,245,.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </span>
        )}
      </span>
    </>
  );

  const estilo = {
    position: 'relative' as const, display: 'flex', flexDirection: 'column' as const,
    width: 172, height: 194, flexShrink: 0, borderRadius: 18, overflow: 'hidden',
    background: '#0F0F0C', animationDelay: `${delay}ms`,
  };

  if (!t.enlace) return <li className="a-up" style={estilo}>{cuerpo}</li>;

  return (
    <li className="a-up" style={estilo}>
      {t.enlace.interno ? (
        // Los internos son rutas del portal («/reservar»), guardadas sin el
        // prefijo del estudio: se lo pone `href()`, que es quien sabe el slug.
        <Link href={href(t.enlace.valor)} className="tap" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          {cuerpo}
        </Link>
      ) : (
        // Externo: pestaña nueva y `noopener` — la página de destino la elige
        // el estudio, no nosotros.
        <a href={t.enlace.valor} target="_blank" rel="noopener noreferrer" className="tap" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
          {cuerpo}
        </a>
      )}
    </li>
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
      {/* El desbordamiento sale del padre acolchado y llega al borde de la
          pantalla: una fila que se corta a 18 px del borde no se lee como
          «sigue hacia la derecha», se lee como recortada. */}
      <ul
        className="no-scrollbar"
        style={{
          display: 'flex', gap: 11, margin: '0 -18px', padding: '2px 18px',
          listStyle: 'none', overflowX: 'auto', scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {data.map((t, i) => <Tarjeta key={t.id} t={t} href={href} delay={i * 55} />)}
      </ul>
    </section>
  );
}

'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useAsync } from '@/lib/student/useAsync';
import { getTablon } from '@/lib/student/comunidad';
import { relativo } from '@/lib/student/formato';

// Bloque «Del estudio» de la Home: la última publicación del tablón y un
// enlace al tablón entero. Secundario a propósito: si no hay nada o la
// petición falla, no se pinta — la Home no enseña un error por esto.
export function DelEstudio({ studioId, href }: { studioId: string; href: string }) {
  const cargar = useCallback(async () => (await getTablon(studioId, undefined, 1)) ?? [], [studioId]);
  const { data, estado } = useAsync(cargar);
  const post = data?.[0];
  if (estado !== 'ready' || !post) return null;

  return (
    <Link href={href} className="card card--tap a-up" data-testid="del-estudio" style={{ display: 'block', padding: '13px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <p className="t-label" style={{ margin: 0 }}>Del estudio</p>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>Ver el tablón →</span>
      </div>
      <p style={{ margin: '7px 0 0', fontSize: 13.5, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {post.tipo === 'EVENTO' && <span className="badge" style={{ marginRight: 6, verticalAlign: 'middle' }}>Evento</span>}
        {post.texto}
      </p>
      <p className="t-mono" style={{ margin: '6px 0 0', fontSize: 9.5, color: 'var(--subtle-foreground)' }}>{post.autorNombre} · {relativo(post.creadoEn)}</p>
    </Link>
  );
}

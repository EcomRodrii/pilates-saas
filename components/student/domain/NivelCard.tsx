'use client';

import Link from 'next/link';
import type { GamificacionVista } from '@/lib/student/tipos';

// «Tu nivel» en Inicio: nivel, créditos y lo que falta para el siguiente.
// Solo si el estudio usa gamificación — sin configurar, no se pinta nada en
// vez de un tablero a cero. Un toque lleva a la pantalla completa.
export function NivelCard({ g, href }: { g: GamificacionVista; href: string }) {
  if (!g.hay) return null;
  const { actual, siguiente, faltan, progreso } = g.nivel;
  return (
    <Link href={href} className="card card--tap" data-testid="nivel-inicio" style={{ display: 'block', padding: '13px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <p className="t-label" style={{ margin: 0 }}>Tu nivel</p>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>{g.saldo} créditos →</span>
      </div>
      <p style={{ margin: '5px 0 0', fontSize: 15, fontWeight: 800, letterSpacing: '-.02em' }}>
        {actual ? `${actual.icono} ${actual.nombre}` : 'Empieza a sumar créditos'}
      </p>
      {siguiente && (
        <>
          <div aria-hidden style={{ height: 5, borderRadius: 99, background: 'var(--muted)', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${Math.round(progreso * 100)}%`, height: '100%', borderRadius: 99, background: 'var(--accent)', transition: 'width .6s var(--ease)' }} />
          </div>
          <p className="t-meta" style={{ margin: '5px 0 0' }}>Te faltan {faltan} para {siguiente.nombre}</p>
        </>
      )}
    </Link>
  );
}

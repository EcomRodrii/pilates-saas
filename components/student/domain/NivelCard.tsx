'use client';

import Link from 'next/link';
import type { GamificacionVista } from '@/lib/student/tipos';

// «Tu nivel» en Inicio: nivel, créditos y lo que falta para el siguiente.
// Solo si el estudio usa gamificación — sin configurar, no se pinta nada en
// vez de un tablero a cero. Un toque lleva a la pantalla completa.
//
// ⚠️ COMPOSICIÓN. Era la misma caja plana que el resto: rótulo, línea de texto,
// barra fina y pie. El nivel es lo único de esta app que tiene una IDENTIDAD
// —un icono y un nombre que el estudio ha elegido—, y estaba escrito como una
// fila de datos más. Ahora el emblema ocupa su sitio a la izquierda y el texto
// se ordena a su lado, que es como se lee un distintivo.
//
// Lo que NO cambia: si no hay nivel siguiente no se inventa una meta, y los
// créditos son los que dice el servidor.
export function NivelCard({ g, href }: { g: GamificacionVista; href: string }) {
  if (!g.hay) return null;
  const { actual, siguiente, faltan, progreso } = g.nivel;
  const pct = Math.round(progreso * 100);

  return (
    <Link
      href={href}
      className="card card--tap card--pad-lg stack"
      data-testid="nivel-inicio"
      style={{ ['--gap' as string]: 'var(--s-3)' }}
    >
      <div className="row row--between">
        <p className="t-label">Tu nivel</p>
        <span className="t-meta no-shrink t-num" style={{ color: 'var(--accent)', fontWeight: 800 }}>
          {g.saldo} créditos →
        </span>
      </div>

      <div className="row" style={{ ['--gap' as string]: 'var(--s-3)' }}>
        {/* El emblema. Sin nivel todavía, el disco se queda vacío en lugar de
            enseñar un icono prestado: es el sitio donde irá el suyo. */}
        <span
          aria-hidden
          className="avatar"
          style={{ ['--size' as string]: '46px', fontSize: 24, background: actual ? 'var(--accent-soft)' : 'var(--muted)' }}
        >
          {actual?.icono ?? ''}
        </span>
        <div className="stack" style={{ ['--gap' as string]: '2px', minWidth: 0 }}>
          <p className="t-card-title trunc">{actual ? actual.nombre : 'Empieza a sumar créditos'}</p>
          {siguiente
            ? <p className="t-meta">Te faltan {faltan} para {siguiente.nombre}</p>
            : actual && <p className="t-meta">Has llegado al último nivel</p>}
        </div>
      </div>

      {siguiente && (
        <div aria-hidden className="bar" style={{ ['--pct' as string]: `${pct}%` }}><i /></div>
      )}
    </Link>
  );
}

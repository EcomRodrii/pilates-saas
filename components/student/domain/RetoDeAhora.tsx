'use client';

import Link from 'next/link';
import type { RetoVista } from '@/lib/student/gamificacion';
import { Icono } from '@/components/student/ui/Icono';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';

/**
 * El reto en el que está apuntada, en Inicio. Copia de la maqueta (fundador, 19-oct-2026): foto a la izquierda, el
 * antetítulo, el nombre, la descripción y la barra «5/8».
 *
 * La FOTO: un reto no tiene foto propia (`challenge_definitions` no guarda imagen), así que va la portada del estudio
 * (`estudio.fotoPortada`), la misma que ya enseña su app. Sin portada, un fondo neutro.
 *
 * ⚠️ HUECO. La gamificación (retos, logros, insignias y sus iconos 3D) la diseña otra sesión (FIDELIDAD); esta tarjeta
 * pinta los datos que YA existen (`retosDe`, el mismo cálculo que `/logros`). Sin el emoji del estudio.
 *
 * Solo un reto vigente en el que esté apuntada y que no haya completado; si no hay, no pinta nada.
 */
export function RetoDeAhora({ retos, href, fotoUrl }: { retos: RetoVista[]; href: string; fotoUrl?: string | null }) {
  const r = retos.find((x) => x.apuntada && !x.completado);
  if (!r) return null;
  const pct = r.objetivo > 0 ? Math.min(100, Math.round((r.progresoActual / r.objetivo) * 100)) : 0;
  return (
    <Link href={href} transitionTypes={TRANSICION_ADELANTE} className="card tap a-fade tarjeta-reto" data-testid="reto-de-ahora" aria-label={`Reto ${r.nombre}: ${r.progresoActual} de ${r.objetivo}`}>
      <span aria-hidden className="tarjeta-reto__foto" style={fotoUrl ? { backgroundImage: `url(${fotoUrl})` } : undefined} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 14px 14px 16px' }}>
        <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span className="t-meta" style={{ flex: 1, fontWeight: 600 }}>
            Reto · {r.diasRestantes === 0 ? 'acaba hoy' : r.diasRestantes === 1 ? 'queda 1 día' : `quedan ${r.diasRestantes} días`}
          </span>
          <Icono nombre="chevron-derecha" tamano={18} />
        </span>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', fontSize: 'calc(19px * var(--heading-scale, 1))', letterSpacing: '-.02em', lineHeight: 1.15 }}>{r.nombre}</span>
        {r.descripcion && <span className="t-meta">{r.descripcion}</span>}
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 10 }}>
          <span aria-hidden className="bar" style={{ flex: 1, ['--pct' as string]: `${pct}%` }}><i /></span>
          <span className="t-meta t-num" style={{ fontWeight: 700 }}>{r.progresoActual}/{r.objetivo}</span>
        </span>
      </span>
    </Link>
  );
}

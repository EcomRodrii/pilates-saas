'use client';

import Link from 'next/link';
import { coloresMonograma, inicialDe } from '@/lib/monograma-estudio';
import { usePortalHref } from '@/components/student/contexto';
import { Badge } from '@/components/student/ui/Badge';
import { Icono } from '@/components/student/ui/Icono';
import { TEXTOS_CLASES_FIJAS as T } from '@/lib/student/clases-fijas-textos';
import type { ClaseSueltaVista } from '@/lib/student/clases-fijas';

/**
 * Una clase que se repite cada semana, con el MISMO aspecto que una clase del
 * horario (`ClassCard`): logo o color del tipo con la hora, nombre, instructora y
 * sala. La tarjeta entera abre la ficha de su próxima clase, que es donde se pide
 * la clase fija — igual que en el horario se reserva desde la ficha, no desde la
 * lista. Aquí solo se dice en qué punto está ella con esa clase.
 */
export function ClaseFijaCard({ f, delay = 0 }: { f: ClaseSueltaVista; delay?: number }) {
  const href = usePortalHref();
  const chip = coloresMonograma(f.color ?? '');
  const estado = f.estado.estado;
  return (
    <Link
      href={href('/reservar/' + f.proximaSesionId)} data-testid="clase-suelta"
      aria-label={`${f.tipo}, ${f.hora}${f.instructora ? `, con ${f.instructora}` : ''}${f.sala ? `, ${f.sala}` : ''}`}
      className="card card--tap a-up"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', animationDelay: delay + 'ms',
        borderColor: estado === 'TIENE_PLAZA' ? 'var(--accent)' : undefined, borderWidth: estado === 'TIENE_PLAZA' ? 1.5 : 1,
      }}
    >
      <div className="stack" style={{ ['--gap' as string]: '5px', alignItems: 'center', minWidth: 46 }}>
        {f.logoUrl ? (
          <span aria-hidden data-testid="logo-tipo-clase" style={{ width: 30, height: 30, borderRadius: 9, background: `url(${f.logoUrl}) center/cover`, border: '1px solid var(--muted)' }} />
        ) : (
          <span aria-hidden style={{
            width: 30, height: 30, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: chip.fondo, color: chip.texto, fontSize: 'var(--t-small)', fontWeight: 800, letterSpacing: '-.02em',
          }}>
            {inicialDe(f.tipo)}
          </span>
        )}
        <p className="t-num" style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 700 }}>{f.hora}</p>
      </div>
      <div aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--muted)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.tipo}</p>
        <p className="t-meta" style={{ margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[f.instructora, f.sala].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {estado === 'TIENE_PLAZA' && <Badge tone="booked">{T.laTienesCorta}</Badge>}
        {estado === 'PEDIDA' && <Badge tone="wait">{T.pedidaCorta}</Badge>}
        {estado === 'SOLO_CON_CUOTA' && <Badge tone="neutral">{T.sueltaSinCuota}</Badge>}
        <span aria-hidden style={{ display: 'flex', color: 'var(--subtle-foreground)' }}><Icono nombre="chevron-derecha" tamano={18} /></span>
      </div>
    </Link>
  );
}

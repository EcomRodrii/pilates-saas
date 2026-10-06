'use client';

import Link from 'next/link';
import { usePortalHref } from '@/components/student/contexto';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import type { ComoVienesVista } from '@/lib/student/como-vienes';
import { Icono } from '@/components/student/ui/Icono';
import { CARA } from '@/components/student/domain/BookingSummary';

/**
 * «Cómo vienes» (P02): con SUS datos, con qué viene a esta clase. La cara (icono y fondo) es la MISMA que la de la hoja
 * para el mismo tono (`CARA`), así que un muro se ve como un muro aquí y allí. Solo informa: no vende ni cobra.
 */
export function ComoVienes({ vista }: { vista: ComoVienesVista | null }) {
  const href = usePortalHref();
  if (!vista) return null;
  const cara = CARA[vista.tono];
  const enlace = vista.enlace;
  return (
    <section className="card" data-testid="como-vienes" data-caso={vista.caso} aria-label="Cómo vienes" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden className={'note note--simbolo ' + cara.clase} style={{ padding: 0, background: 'transparent', border: 'none', flexShrink: 0 }}>
        <span className="note-simbolo"><span style={{ display: 'flex' }}><Icono nombre={cara.icono} tamano={14} grosor={2} /></span></span>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="t-card-title" style={{ margin: 0 }}>{vista.titulo}</p>
        {vista.detalle && <p className="t-meta" style={{ margin: '2px 0 0' }}>{vista.detalle}</p>}
      </div>
      {enlace && (
        <Link
          href={href(enlace.destino === 'bono' ? `/bonos/${enlace.bonoId}` : '/comprar')}
          transitionTypes={enlace.destino === 'bono' ? TRANSICION_ADELANTE : undefined}
          className="tap no-shrink"
          style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 2 }}
        >
          {enlace.texto}
          <Icono nombre="chevron-derecha" tamano={16} />
        </Link>
      )}
    </section>
  );
}

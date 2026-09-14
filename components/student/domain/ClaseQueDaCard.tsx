'use client';

import { Badge } from '@/components/student/ui/Badge';
import { textoBaja, type ClaseQueDa } from '@/lib/student/agenda-instructora';

/**
 * Una clase que imparte la instructora.
 *
 * Lleva lo que necesita para prepararla —hora, sala y cuántas vienen— y NADA de
 * las alumnas: los nombres llegan en la Fase 2, acotados a sus clases (RGPD).
 * Si ha pedido la baja, lo que diga el estado va debajo, sin prometer nada que
 * no esté pasando (ver `textoBaja`).
 */
export function ClaseQueDaCard({ clase, conFecha, etiqueta }: {
  clase: ClaseQueDa;
  conFecha?: string;
  /** «Das clase» en la agenda única, para distinguirla de las que reserva. */
  etiqueta?: string;
}) {
  const baja = clase.baja ? textoBaja(clase.baja.estado, clase.baja.sustituta) : null;
  return (
    <article
      className="card row row--top"
      data-testid="clase-que-da"
      style={{ ['--gap' as string]: 'var(--s-3)', padding: 'var(--s-4)', opacity: clase.cancelada ? 0.6 : 1 }}
    >
      <span
        aria-hidden
        style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: clase.color || 'var(--accent)', flexShrink: 0 }}
      />
      <div className="stack" style={{ ['--gap' as string]: 'var(--s-1)', minWidth: 0, flex: 1 }}>
        <p className="t-meta">
          {conFecha ? `${conFecha} · ` : ''}{clase.hora}–{clase.horaFin}{clase.sala ? ` · ${clase.sala}` : ''}
        </p>
        <div className="row" style={{ ['--gap' as string]: 'var(--s-2)', minWidth: 0 }}>
          <p className="t-card-title trunc">{clase.tipo}</p>
          {etiqueta && <Badge tone="neutral">{etiqueta}</Badge>}
        </div>
        <div className="row" style={{ ['--gap' as string]: 'var(--s-2)', flexWrap: 'wrap' }}>
          {clase.cancelada ? (
            <Badge tone="full">Cancelada</Badge>
          ) : (
            <>
              <span className="t-small">
                <b>{clase.confirmadas}</b> de {clase.aforo} plazas
              </span>
              {clase.enEspera > 0 && <Badge tone="wait">{clase.enEspera} en espera</Badge>}
            </>
          )}
        </div>
        {baja && (
          <div className="stack" role="status" style={{ ['--gap' as string]: '2px', marginTop: 'var(--s-1)' }}>
            <p className="t-small" style={{ fontWeight: 700 }}>{baja.titulo}</p>
            {baja.detalle && <p className="t-small t-dim">{baja.detalle}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

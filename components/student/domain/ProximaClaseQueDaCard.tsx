'use client';

import Link from 'next/link';
import { textoBaja, type ClaseQueDa } from '@/lib/student/agenda-instructora';
import { Foto } from '@/components/student/ui/Foto';

/**
 * «Tu próxima clase» de la instructora, con la misma cara que la de la alumna
 * (`NextClassCard`): la foto de la clase bajo el verde noche del kit y el texto
 * claro encima. Sin foto, el verde noche solo.
 *
 * Lleva lo que necesita para prepararla —hora, sala y cuántas vienen— y, si ha
 * pedido la baja, en qué está (ver `textoBaja`). «Pasar lista» solo aparece
 * cuando ya se puede: quien llama decide con `puedePasarLista`.
 */
export function ProximaClaseQueDaCard({ clase, foto, cuando, enCurso, hrefClase, hrefLista }: {
  clase: ClaseQueDa;
  foto: string | null;
  /** «Hoy · 20:00», «Jue 17 · 20:00». */
  cuando: string;
  enCurso: boolean;
  hrefClase: string;
  hrefLista?: string;
}) {
  const baja = clase.baja ? textoBaja(clase.baja.estado, clase.baja.sustituta) : null;
  const botonSecundario = {
    height: 34,
    background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)',
    color: 'var(--accent-deep-foreground)',
    border: '1px solid color-mix(in srgb, var(--accent-deep-foreground) 35%, transparent)',
  };
  const detalle = [
    `${clase.hora}–${clase.horaFin}`,
    clase.sala,
    `${clase.confirmadas} de ${clase.aforo} plazas`,
    clase.enEspera > 0 ? `${clase.enEspera} en espera` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section
      data-testid="clase-que-da"
      aria-label={enCurso ? 'Tu clase de ahora' : 'Tu próxima clase'}
      className="a-pop"
      style={{ position: 'relative', borderRadius: 'var(--radius-hero)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)' }}
    >
      {foto && (
        <Foto
          src={foto}
          ancho={640}
          alto={200}
          sizes="(min-width:768px) 640px, 100vw"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(18,41,26,.95), rgba(18,41,26,.68))' }} />
      <div style={{ position: 'relative', padding: '14px 15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <p className="t-label" role={enCurso ? 'status' : undefined} style={{ color: enCurso ? 'var(--on-dark)' : 'var(--accent-deep-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: enCurso ? '#FAF9F5' : 'var(--accent-deep-muted)', animation: enCurso ? 'apPulse 1.6s infinite' : 'apPulse 2s infinite' }} />
            {enCurso ? 'Tu clase, en curso' : 'Tu próxima clase'}
          </p>
          <span className="t-num" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--accent-deep-muted)', whiteSpace: 'nowrap' }}>{cuando}</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--t-h3)', fontWeight: 800, letterSpacing: '-.02em', color: 'var(--on-dark)' }}>{clase.tipo}</p>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 80%, transparent)' }}>{detalle}</p>
        {baja && (
          <div role="status" style={{ marginTop: 10, padding: '8px 11px', borderRadius: 12, background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)' }}>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--on-dark)' }}>{baja.titulo}</p>
            {baja.detalle && <p style={{ margin: '1px 0 0', fontSize: 'var(--t-meta)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 80%, transparent)' }}>{baja.detalle}</p>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
          {hrefLista && (
            <Link href={hrefLista} className="btn btn--sm tap" style={{ background: 'var(--on-dark)', color: 'var(--accent-deep)', height: 34 }}>Pasar lista</Link>
          )}
          <Link
            href={hrefClase}
            className="btn btn--sm tap"
            style={hrefLista ? botonSecundario : { background: 'var(--on-dark)', color: 'var(--accent-deep)', height: 34 }}
          >
            Ver la clase
          </Link>
        </div>
      </div>
    </section>
  );
}

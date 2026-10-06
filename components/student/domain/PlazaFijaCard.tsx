'use client';

import Link from 'next/link';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import type { PlazaFijaVista, RecuperacionesVista } from '@/lib/student/tipos';
import { etiquetaDia, fechaCorta } from '@/lib/student/formato';
import { nombreDia } from '@/lib/student/plaza-fija';
import { TEXTOS_PLAZA_FIJA } from '@/lib/student/plaza-fija-textos';
import { usePortalHref } from '@/components/student/contexto';
import { Badge } from '@/components/student/ui/Badge';
import { Icono } from '@/components/student/ui/Icono';

// «Tu clase fija» + «Recuperaciones» (F2, el caso canónico del producto).
// Mismo idioma que CreditCard: tarjeta, rótulo t-label, cifra grande, meta.
// No decide nada: el servidor es quien materializa la plaza y quien acepta
// una recuperación al reservar.
//
// Todas sus plazas, no una: quien viene lunes y miércoles veía solo una de las
// dos. Y si en su hueco ya no hay clase, lo dice en vez de enseñar una
// «próxima» que no existe (lib/student/plaza-fija.ts).
//
// Es la tarjeta COMPACTA de Inicio y de Bonos. La de «Mis clases → Fija», con las
// próximas semanas, la pausa, el mes y dejarla, es `MiClaseFija` (5-oct-2026).

/**
 * Lleva a la ficha de esa clase, como una clase del horario. Sin clase a la que
 * ir, pinta lo mismo sin enlace: nunca un enlace a una ficha que no existe.
 */
function EnlaceClase({ sesionId, etiqueta, flex = false, children }: { sesionId: string | null; etiqueta: string; flex?: boolean; children: React.ReactNode }) {
  const href = usePortalHref();
  const estilo: React.CSSProperties = { display: 'block', minWidth: 0, color: 'inherit', ...(flex ? { flex: 1 } : {}) };
  if (!sesionId) return <div style={estilo}>{children}</div>;
  return <Link href={href('/reservar/' + sesionId)} transitionTypes={TRANSICION_ADELANTE} aria-label={etiqueta} data-testid="enlace-clase-fija" style={estilo}>{children}</Link>;
}

export function PlazaFijaCard({ plazas, recuperaciones, hrefHorario }: {
  plazas: PlazaFijaVista[]; recuperaciones: RecuperacionesVista; hrefHorario: string;
  /** Siempre compacta: la tarjeta entera de «Mis clases → Fija» es `MiClaseFija`. Se acepta por los que ya lo pasan. */
  compacta?: boolean;
}) {
  const href = usePortalHref();

  if (plazas.length === 0 && recuperaciones.disponibles === 0) return null;

  const estadoDe = (plaza: PlazaFijaVista) => {
    const activa = plaza.estado === 'ACTIVA' && !plaza.pausa?.enCurso;
    return { activa, tono: (plaza.sinClase ? 'few' : activa ? 'ok' : 'neutral') as 'few' | 'ok' | 'neutral', texto: plaza.sinClase ? 'Sin clase' : activa ? 'Activa' : 'En pausa' };
  };

  const bloqueRecuperaciones = recuperaciones.disponibles > 0 && (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div>
        <p className="t-label" style={{ margin: 0 }}>Recuperaciones</p>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--t-body)', fontWeight: 800 }}>
          {recuperaciones.disponibles === 1 ? '1 clase por recuperar' : `${recuperaciones.disponibles} clases por recuperar`}
        </p>
        {recuperaciones.proximaCaducidad && (
          <p className="t-meta" style={{ margin: '2px 0 0' }}>La primera caduca el {fechaCorta(recuperaciones.proximaCaducidad)}</p>
        )}
        {/* De cuáles se acuerda uno: las que se ganó. ⚠️ El nombre sale del
            VÍNCULO con el canje, nunca de `recuperaciones.motivo` — eso es texto
            libre que escribe el mostrador, y en producción hay uno que pone «mm». */}
        {recuperaciones.detalle.filter((r) => r.deRecompensa).map((r, i) => (
          <p key={i} className="t-meta" style={{ margin: '2px 0 0', color: 'var(--accent)' }}>
            🎁 Una es tu {r.deRecompensa}
          </p>
        ))}
      </div>
      <Link href={hrefHorario} style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>Reservar →</Link>
    </div>
  );

  // ── Inicio: una tarjeta, lo justo para saber que la tiene y cuándo es la próxima.
  return (
    <div className="card" data-testid="plaza-fija" style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plazas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="t-label" style={{ margin: 0 }}>{plazas.length === 1 ? TEXTOS_PLAZA_FIJA.tarjetaUna : TEXTOS_PLAZA_FIJA.tarjetaVarias}</p>
          {plazas.map((plaza, i) => {
            const e = estadoDe(plaza);
            const dia = nombreDia(plaza.diaSemana);
            return (
              <div
                key={`${plaza.diaSemana}-${plaza.hora}-${plaza.sala}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingTop: i > 0 ? 8 : 0, borderTop: i > 0 ? '1px solid var(--muted)' : 'none' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <EnlaceClase sesionId={plaza.proximas[0]?.sesionId ?? null} etiqueta={`Ver tu clase del ${dia} a las ${plaza.hora}`}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 800, letterSpacing: '-.02em', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {dia.charAt(0).toUpperCase() + dia.slice(1)} · {plaza.hora}
                      {plaza.proximas[0] && <span aria-hidden style={{ display: 'flex', color: 'var(--subtle-foreground)' }}><Icono nombre="chevron-derecha" tamano={16} /></span>}
                    </p>
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      {[plaza.tipo, plaza.sala].filter(Boolean).join(' · ')}
                      {plaza.proximaFecha ? ` · próxima ${etiquetaDia(plaza.proximaFecha).toLowerCase()}` : ''}
                    </p>
                  </EnlaceClase>
                  {plaza.sinClase && <p className="t-meta" style={{ margin: '2px 0 0' }}>Ahora no hay clase en ese horario: pregúntale al estudio.</p>}
                </div>
                <Badge tone={e.tono}>{e.texto}</Badge>
              </div>
            );
          })}
          <Link href={href('/mis-reservas?tab=fijas')} data-testid="ver-mis-clases-fijas" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)' }}>
            Ver mis clases fijas →
          </Link>
        </div>
      )}
      {bloqueRecuperaciones && <div style={{ paddingTop: plazas.length > 0 ? 10 : 0, borderTop: plazas.length > 0 ? '1px solid var(--muted)' : 'none' }}>{bloqueRecuperaciones}</div>}
    </div>
  );
}

'use client';

import Link from 'next/link';
import type { PlazaFijaVista, RecuperacionesVista } from '@/lib/student/tipos';
import { etiquetaDia, fechaCorta } from '@/lib/student/formato';
import { nombreDia } from '@/lib/student/plaza-fija';
import { Badge } from '@/components/student/ui/Badge';

// «Tu plaza fija» + «Recuperaciones» (F2, el caso canónico del producto).
// Mismo idioma que CreditCard: tarjeta, rótulo t-label, cifra grande, meta.
// No decide nada: el servidor es quien materializa la plaza y quien acepta
// una recuperación al reservar.
export function PlazaFijaCard({ plaza, recuperaciones, hrefHorario, compacta = false }: {
  plaza: PlazaFijaVista | null; recuperaciones: RecuperacionesVista; hrefHorario: string; compacta?: boolean;
}) {
  if (!plaza && recuperaciones.disponibles === 0) return null;
  return (
    <div className="card" data-testid="plaza-fija" style={{ padding: compacta ? '13px 15px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plaza && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p className="t-label" style={{ margin: 0 }}>Tu plaza fija</p>
            <p style={{ margin: '4px 0 0', fontSize: compacta ? 14 : 16, fontWeight: 800, letterSpacing: '-.02em' }}>
              {nombreDia(plaza.diaSemana).charAt(0).toUpperCase() + nombreDia(plaza.diaSemana).slice(1)} · {plaza.hora}
            </p>
            <p className="t-meta" style={{ margin: '2px 0 0' }}>
              {[plaza.tipo, plaza.sala].filter(Boolean).join(' · ')}
              {plaza.proximaFecha ? ` · próxima ${etiquetaDia(plaza.proximaFecha).toLowerCase()}` : ''}
              {plaza.vigenciaHasta ? ` · hasta el ${fechaCorta(plaza.vigenciaHasta)}` : ''}
            </p>
          </div>
          <Badge tone={plaza.estado === 'ACTIVA' ? 'ok' : 'neutral'}>{plaza.estado === 'ACTIVA' ? 'Activa' : 'En pausa'}</Badge>
        </div>
      )}
      {recuperaciones.disponibles > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: plaza ? 10 : 0, borderTop: plaza ? '1px solid var(--muted)' : 'none' }}>
          <div>
            <p className="t-label" style={{ margin: 0 }}>Recuperaciones</p>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, fontWeight: 800 }}>
              {recuperaciones.disponibles === 1 ? '1 clase por recuperar' : `${recuperaciones.disponibles} clases por recuperar`}
            </p>
            {recuperaciones.proximaCaducidad && (
              <p className="t-meta" style={{ margin: '2px 0 0' }}>La primera caduca el {fechaCorta(recuperaciones.proximaCaducidad)}</p>
            )}
          </div>
          <Link href={hrefHorario} style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>Reservar →</Link>
        </div>
      )}
    </div>
  );
}

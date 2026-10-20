'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getHistorial } from '@/lib/student/historial';
import type { ClaseDelHistorial } from '@/lib/student/estadisticas';
import { semanaDe } from '@/lib/student/ritmo';
import { hoyISO } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { Icono } from '@/components/student/ui/Icono';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';

/**
 * «Tu progreso esta semana», copia de la maqueta (fundador, 19-oct-2026): anillo «hechas / mínimo», «N clases
 * completadas» y los siete días con los que ha venido marcados.
 *
 * ⚠️ Nada inventado:
 * - Las clases hechas salen de su HISTORIAL (`getHistorial`, solo `ASISTIDA`, lo que el estudio marcó), no del catálogo,
 *   que no trae clases pasadas.
 * - El denominador del anillo es el mínimo semanal que el ESTUDIO fija en Configuración para la racha
 *   (`racha_clases_semana`), el único objetivo semanal que existe. Sin él, 1 (lo mismo que usa la racha).
 * Sin historial legible (sin red, sin sesión) no pinta nada: un «0/2» a quien sí ha venido sería mentira.
 */
export function TuProgreso({ studioId, minimoSemanal, hrefMas }: { studioId: string; minimoSemanal: number; hrefMas: string }) {
  const [historial, setHistorial] = useState<ClaseDelHistorial[] | null>(null);
  const ahoraMs = useAhoraMs();
  useEffect(() => {
    let vivo = true;
    void getHistorial(studioId).then((h) => { if (vivo) setHistorial(h); });
    return () => { vivo = false; };
  }, [studioId]);
  if (!historial || ahoraMs === null) return null;
  const hoy = hoyISO(new Date(ahoraMs));
  const dias = semanaDe(
    historial.filter((c) => c.estado === 'ASISTIDA').map((c) => ({ fecha: hoyISO(new Date(c.inicio)), estado: 'asistida' })),
    hoy,
  );
  const lunes = dias[0].fecha;
  const hechas = historial.filter((c) => c.estado === 'ASISTIDA' && hoyISO(new Date(c.inicio)) >= lunes && hoyISO(new Date(c.inicio)) <= hoy).length;
  const meta = Math.max(1, minimoSemanal);
  const pct = Math.min(1, hechas / meta);
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <section aria-labelledby="tu-progreso-t" data-testid="tu-progreso" className="a-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="tu-progreso-t" className="t-h2" style={{ margin: 0 }}>Tu progreso esta semana</h2>
        <Link href={hrefMas} transitionTypes={TRANSICION_ADELANTE} className="tap enlace-ver">
          Ver más <Icono nombre="flecha-derecha" tamano={16} />
        </Link>
      </div>
      <Link href={hrefMas} transitionTypes={TRANSICION_ADELANTE} className="card tap" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', color: 'var(--foreground)' }}>
        <span role="img" aria-label={meta > 1 ? `${hechas} de ${meta} esta semana` : `${hechas} esta semana`} style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
          <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden>
            <circle cx="40" cy="40" r={R} fill="none" stroke="var(--muted)" strokeWidth="6" />
            <circle cx="40" cy="40" r={R} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 40 40)" style={{ transition: 'stroke-dasharray .6s var(--ease)' }} />
          </svg>
          <span className="t-num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-body)', fontWeight: 800 }}>
            {/* «N/M» solo con un mínimo de verdad: con el de serie (1), «2/1» no dice nada. */}
            {meta > 1 ? `${hechas}/${meta}` : hechas}
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="t-card-title">{hechas === 1 ? '1 clase completada' : `${hechas} clases completadas`}</span>
          <span aria-label="Días de esta semana" style={{ display: 'flex', gap: 5 }}>
            {dias.map((d) => (
              <span key={d.fecha} className={'dia-progreso' + (d.hecha ? ' dia-progreso--hecho' : '')} aria-label={`${d.letra}${d.hecha ? ', con clase' : ''}`}>
                {d.letra}
              </span>
            ))}
          </span>
        </span>
        <Icono nombre="chevron-derecha" tamano={18} />
      </Link>
    </section>
  );
}

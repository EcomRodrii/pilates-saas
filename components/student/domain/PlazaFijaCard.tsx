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
//
// Todas sus plazas, no una: quien viene lunes y miércoles veía solo una de las
// dos. Y si en su hueco ya no hay clase, lo dice en vez de enseñar una
// «próxima» que no existe (lib/student/plaza-fija.ts).
export function PlazaFijaCard({ plazas, recuperaciones, hrefHorario, compacta = false }: {
  plazas: PlazaFijaVista[]; recuperaciones: RecuperacionesVista; hrefHorario: string; compacta?: boolean;
}) {
  if (plazas.length === 0 && recuperaciones.disponibles === 0) return null;
  return (
    <div className="card" data-testid="plaza-fija" style={{ padding: compacta ? '13px 15px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {plazas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="t-label" style={{ margin: 0 }}>{plazas.length === 1 ? 'Tu plaza fija' : 'Tus plazas fijas'}</p>
          {plazas.map((plaza, i) => {
            const activa = plaza.estado === 'ACTIVA' && !plaza.pausa?.enCurso;
            const dia = nombreDia(plaza.diaSemana);
            return (
              <div
                key={`${plaza.diaSemana}-${plaza.hora}-${plaza.sala}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingTop: i > 0 ? 8 : 0, borderTop: i > 0 ? '1px solid var(--muted)' : 'none' }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: compacta ? 14 : 16, fontWeight: 800, letterSpacing: '-.02em' }}>
                    {dia.charAt(0).toUpperCase() + dia.slice(1)} · {plaza.hora}
                  </p>
                  <p className="t-meta" style={{ margin: '2px 0 0' }}>
                    {[plaza.tipo, plaza.sala].filter(Boolean).join(' · ')}
                    {plaza.proximaFecha ? ` · próxima ${etiquetaDia(plaza.proximaFecha).toLowerCase()}` : ''}
                    {plaza.vigenciaHasta ? ` · hasta el ${fechaCorta(plaza.vigenciaHasta)}` : ''}
                  </p>
                  {plaza.sinClase && (
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      Ahora no hay clase en ese horario: pregúntale al estudio.
                    </p>
                  )}
                  {plaza.pausa && (
                    <p className="t-meta" style={{ margin: '2px 0 0' }}>
                      {plaza.pausa.enCurso
                        ? `En pausa hasta el ${fechaCorta(plaza.pausa.hasta)}`
                        : `Pausa del ${fechaCorta(plaza.pausa.desde)} al ${fechaCorta(plaza.pausa.hasta)}`}
                    </p>
                  )}
                </div>
                <Badge tone={plaza.sinClase ? 'few' : activa ? 'ok' : 'neutral'}>
                  {plaza.sinClase ? 'Sin clase' : activa ? 'Activa' : 'En pausa'}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
      {recuperaciones.disponibles > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingTop: plazas.length > 0 ? 10 : 0, borderTop: plazas.length > 0 ? '1px solid var(--muted)' : 'none' }}>
          <div>
            <p className="t-label" style={{ margin: 0 }}>Recuperaciones</p>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--t-body)', fontWeight: 800 }}>
              {recuperaciones.disponibles === 1 ? '1 clase por recuperar' : `${recuperaciones.disponibles} clases por recuperar`}
            </p>
            {recuperaciones.proximaCaducidad && (
              <p className="t-meta" style={{ margin: '2px 0 0' }}>La primera caduca el {fechaCorta(recuperaciones.proximaCaducidad)}</p>
            )}
            {/* De cuáles se acuerda uno: las que se ganó. Antes veía un número
                y no sabía cuál de esas clases había pagado con sus créditos.
                ⚠️ El nombre sale del VÍNCULO con el canje, nunca de
                `recuperaciones.motivo` — eso es texto libre que escribe el
                mostrador, y en producción hay uno que pone «mm». */}
            {recuperaciones.detalle.filter((r) => r.deRecompensa).map((r, i) => (
              <p key={i} className="t-meta" style={{ margin: '2px 0 0', color: 'var(--accent)' }}>
                🎁 Una es tu {r.deRecompensa}
              </p>
            ))}
          </div>
          <Link href={hrefHorario} style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>Reservar →</Link>
        </div>
      )}
    </div>
  );
}

'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Formato 05 del rediseño (docs/widget-reservas-fase4-brief-diseno.md):
// "Reserva esta clase" — el widget que se enlaza directo a UNA sesión
// (redes/newsletter/story), vía `?sesion=<id>` en el iframe de
// `/reservar/[slug]`. Sin selector para cambiar de clase (respuesta 4 del
// brief) — la única salida es "Ver el horario completo".
//
// Puro en props: no conoce useStudio ni fetching, solo pinta lo que
// `page.tsx` ya resolvió (mismo criterio que ReservaCalendario/CitasPublica).
// ─────────────────────────────────────────────────────────────────────────────

import { serif, sans, cq, radius, shadow } from '@/lib/reservar-publico-tokens';

export function FichaClaseUnica({
  claseNombre, inicio, fin, duracionMinutos, instructorNombre, instructorFotoUrl,
  plazasLibres, precio, yaReservada, onReservar, onVerMisReservas, onVerHorario,
}: {
  claseNombre: string;
  inicio: string;
  fin: string;
  duracionMinutos: number | null;
  instructorNombre: string | null;
  instructorFotoUrl?: string | null;
  /** `null` = ya pasó/está cancelada; no se pinta fila de plazas. */
  plazasLibres: number | null;
  precio: number | null;
  yaReservada: boolean;
  onReservar: () => void;
  /** Sin ella, el botón "Ver mis reservas" no se pinta — el widget embebido
      "Reserva esta clase" no debe saltar a la sección "Mis reservas" (otro
      widget con otro propósito). Solo se pasa fuera de `embedMode`. */
  onVerMisReservas?: () => void;
  onVerHorario: () => void;
}) {
  const fecha = new Date(inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const horaInicio = new Date(inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const horaFin = new Date(fin).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const completa = plazasLibres === 0;

  return (
    <div style={{ padding: `${cq(28, 3.4, 44)} 0 ${cq(50, 7, 90)}`, maxWidth: 560 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', color: 'var(--portal-accent)' }}>
        TE HAN INVITADO A ESTA CLASE
      </div>
      <h2 style={{ fontFamily: serif, fontSize: cq(26, 6, 32), lineHeight: 1.05, marginTop: 10 }}>{claseNombre}</h2>

      <div style={{ marginTop: 22, borderRadius: radius.card, background: 'var(--portal-surface)', border: '1px solid var(--portal-line)', boxShadow: shadow.card }}>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FilaFicha label="FECHA" valor={<span style={{ textTransform: 'capitalize' }}>{fecha}</span>} />
          <FilaFicha label="HORA" valor={
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {horaInicio} — {horaFin}{duracionMinutos ? ` · ${duracionMinutos} min` : ''}
            </span>
          } />
          {instructorNombre && (
            <FilaFicha label="INSTRUCTORA" valor={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {instructorFotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={instructorFotoUrl} alt="" style={{ width: 20, height: 20, borderRadius: 999, objectFit: 'cover' }} />
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--portal-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--portal-muted)' }}>
                    {instructorNombre.charAt(0)}
                  </span>
                )}
                {instructorNombre}
              </span>
            } />
          )}
          {plazasLibres !== null && (
            <FilaFicha label="PLAZAS" valor={
              completa
                ? <span style={{ color: 'var(--portal-muted)' }}>Completa</span>
                : <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: plazasLibres <= 3 ? '#BC8434' : 'var(--portal-ink)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: plazasLibres <= 3 ? '#BC8434' : 'var(--portal-accent)' }} />
                    {`Queda${plazasLibres === 1 ? '' : 'n'} ${plazasLibres} plaza${plazasLibres === 1 ? '' : 's'}`}
                  </span>
            } />
          )}
        </div>

        {yaReservada ? (
          <div style={{ borderTop: '1px dashed var(--portal-line)', background: 'color-mix(in oklab, var(--portal-surface) 55%, var(--portal-velo))', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderRadius: `0 0 ${radius.card}px ${radius.card}px` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999, background: 'color-mix(in oklab, var(--portal-accent) 10%, var(--portal-surface))', color: 'var(--portal-accent)', fontSize: 12.5, fontWeight: 700 }}>
              ✓ Reservada
            </span>
            {onVerMisReservas && (
              <button type="button" onClick={onVerMisReservas} style={{
                height: 44, padding: '0 20px', borderRadius: radius.pillBtnXs, border: '1px solid var(--portal-line)',
                background: 'transparent', color: 'var(--portal-ink)', fontFamily: sans, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>
                Ver mis reservas
              </button>
            )}
          </div>
        ) : (
          <div style={{ borderTop: '1px dashed var(--portal-line)', background: 'color-mix(in oklab, var(--portal-surface) 55%, var(--portal-velo))', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderRadius: `0 0 ${radius.card}px ${radius.card}px` }}>
            <div>
              {precio != null && <div style={{ fontFamily: serif, fontSize: 22, color: 'var(--portal-ink)' }}>{precio.toFixed(2)} €</div>}
              <p style={{ fontSize: 11, color: 'var(--portal-muted)', marginTop: 2 }}>1 clase · pago online</p>
            </div>
            <button type="button" disabled={completa} onClick={onReservar} style={{
              height: 48, padding: '0 28px', borderRadius: radius.pillBtnMd, border: 'none',
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              fontFamily: sans, fontWeight: 700, fontSize: 14, cursor: completa ? 'not-allowed' : 'pointer', opacity: completa ? 0.55 : 1,
            }}>
              {completa ? 'Lista de espera' : 'Reservar mi plaza'}
            </button>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--portal-muted)', marginTop: 16, textAlign: 'center' }}>
        ¿No te viene bien esta hora?{' '}
        <button type="button" onClick={onVerHorario} style={{
          background: 'none', border: 'none', color: 'var(--portal-accent)', fontWeight: 700, textDecoration: 'underline',
          textUnderlineOffset: 3, cursor: 'pointer', padding: 0, fontSize: 'inherit',
        }}>
          Ver el horario completo
        </button>
      </p>
    </div>
  );
}

function FilaFicha({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span style={{ flex: '0 0 96px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'var(--portal-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-ink)' }}>{valor}</span>
    </div>
  );
}

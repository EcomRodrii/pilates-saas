'use client';

// Fase 4 (Booking Engine — Mi Cuenta): saldo de bonos/membresía, compartido
// entre Modo A y Modo B. Cero lógica de negocio nueva — reutiliza
// `bonoActivo()` (lib/bonos-portal.ts), ya testeado, exactamente como hace
// PortalBonosView.
import type { ModoTokens } from '@/lib/portal-modo';
import type { Suscripcion, PlanTarifa, TipoClase } from '@/lib/types';
import { bonoActivo } from '@/lib/bonos-portal';
import { semantic } from '@/lib/portal-tokens';
import { sans, radius } from '@/lib/reservar-publico-tokens';

export function MisBonos({
  t, suscripciones, planesTarifa, tiposClase, socioId,
}: {
  t: ModoTokens;
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  tiposClase: TipoClase[];
  socioId: string | null;
}) {
  const bono = bonoActivo(suscripciones, planesTarifa, tiposClase, socioId);

  if (!bono) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: t.muted, fontSize: 13, fontFamily: sans }}>
        No tienes ningún bono ni plan activo.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: sans }}>
      {bono.bonos.map((b, i) => (
        <div key={i} style={{
          border: `1px solid ${t.line}`, borderRadius: radius.card, padding: 16, background: t.surface,
          opacity: b.agotado ? 0.6 : 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>{b.nombre}</p>
            {b.restantes != null && b.total != null && (
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.muted }}>{b.restantes}/{b.total}</span>
            )}
          </div>
          {b.restantes != null && b.total != null && b.total > 0 && (
            <div style={{ height: 6, borderRadius: 999, background: t.surface2, marginTop: 10, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.min(100, (b.restantes / b.total) * 100)}%`,
                background: bono.urgente ? semantic.warning.text : 'var(--portal-brand)', borderRadius: 999,
              }} />
            </div>
          )}
          {b.textoCaducidad && (
            <p style={{ fontSize: 11.5, color: bono.urgente ? semantic.warning.text : t.muted, marginTop: 8 }}>{b.textoCaducidad}</p>
          )}
        </div>
      ))}
    </div>
  );
}

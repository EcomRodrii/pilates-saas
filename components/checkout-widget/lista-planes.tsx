'use client';

// Fase 3 (Booking Engine — Checkout embebido): punto de entrada "comprar un
// plan/bono" dentro del widget (Modo B). Antes de esta fase no existía
// ninguna superficie para esto en Modo B — el checkout embebido (mecanismo
// de pago) necesitaba un sitio desde el que invocarse, así que esta lista es
// la pieza mínima que lo hace alcanzable, no una decisión de diseño aparte.
import { useState } from 'react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { PlanTarifa } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { sans, radius } from '@/lib/reservar-publico-tokens';
import { semantic } from '@/lib/portal-tokens';
import { CheckoutEmbebido } from './checkout-embebido';

type EstadoCompra =
  | { fase: 'lista' }
  | { fase: 'creando'; planId: string }
  | { fase: 'pagando'; plan: PlanTarifa; clientSecret: string }
  | { fase: 'exito'; plan: PlanTarifa };

export function ListaPlanes({
  t, planes, socioId, publishableKey, stripeAccountId,
  onCrearIntento, onBizum, onCerrar, onComprado, onIniciarSesion,
}: {
  t: ModoTokens;
  planes: PlanTarifa[];
  /** `null` = sin sesión — el botón "Comprar" pide iniciar sesión primero. */
  socioId: string | null;
  publishableKey: string;
  stripeAccountId: string | null;
  onCrearIntento: (plan: PlanTarifa) => Promise<(ResultadoEscritura & { datos?: unknown }) | undefined>;
  onBizum: (plan: PlanTarifa) => void;
  onCerrar: () => void;
  /** Refresca bonos/suscripciones tras una compra confirmada. */
  onComprado?: () => void;
  onIniciarSesion?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoCompra>({ fase: 'lista' });
  const [error, setError] = useState<string | null>(null);
  const activos = planes.filter(p => p.activo);

  const configuracionIncompleta = !publishableKey || !stripeAccountId;

  async function comprar(plan: PlanTarifa) {
    if (!socioId) return; // el caller gatea esto con el login; defensa en profundidad
    // Sin esto, `onCrearIntento` crearía un PaymentIntent real que nadie podría
    // confirmar nunca (el paso de pago no monta sin publishableKey/cuenta
    // Connect) — se corta ANTES de cobrar nada, con un mensaje claro, en vez
    // de dejar que la compra caiga en un estado silencioso sin explicación.
    if (configuracionIncompleta) {
      setError('La compra online no está disponible ahora mismo en este estudio.');
      return;
    }
    setError(null);
    setEstado({ fase: 'creando', planId: plan.id });
    const r = await onCrearIntento(plan);
    if (!r || !r.ok) {
      setError((r && !r.ok && r.error) || 'No se ha podido iniciar la compra.');
      setEstado({ fase: 'lista' });
      return;
    }
    const clientSecret = (r.datos as { clientSecret?: string } | null)?.clientSecret;
    if (!clientSecret) {
      setError('No se ha podido iniciar la compra.');
      setEstado({ fase: 'lista' });
      return;
    }
    setEstado({ fase: 'pagando', plan, clientSecret });
  }

  if (estado.fase === 'exito') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: sans, textAlign: 'center', padding: '12px 0' }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>¡Compra confirmada!</p>
        <p style={{ fontSize: 13, color: t.muted }}>{estado.plan.nombre} ya está activo en tu cuenta.</p>
        <button type="button" onClick={onCerrar} style={{
          width: '100%', height: 44, borderRadius: radius.pillBtnSm, border: 'none', fontSize: 13.5, fontWeight: 800,
          background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', cursor: 'pointer',
        }}>
          Cerrar
        </button>
      </div>
    );
  }

  if (estado.fase === 'pagando' && publishableKey && stripeAccountId) {
    return (
      <CheckoutEmbebido
        t={t} plan={estado.plan} clientSecret={estado.clientSecret}
        publishableKey={publishableKey} stripeAccountId={stripeAccountId}
        onExito={() => { setEstado({ fase: 'exito', plan: estado.plan }); onComprado?.(); }}
        onBizum={() => onBizum(estado.plan)}
        onCerrar={() => setEstado({ fase: 'lista' })}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: sans }}>
      <h2 style={{ fontSize: 20, color: t.ink, fontWeight: 800 }}>Planes y bonos</h2>
      {!socioId && (
        <p style={{ fontSize: 12.5, color: t.muted }}>
          {onIniciarSesion ? (
            <button type="button" onClick={onIniciarSesion} style={{ background: 'none', border: 'none', color: 'var(--portal-brand)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0 }}>
              Inicia sesión
            </button>
          ) : 'Inicia sesión'} para comprar un plan.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 12.5, color: semantic.warning.text, background: semantic.warning.soft, padding: '10px 12px', borderRadius: radius.cardSmall }}>{error}</p>
      )}
      {activos.length === 0 ? (
        <p style={{ fontSize: 13, color: t.muted, textAlign: 'center', padding: '24px 0' }}>No hay planes disponibles ahora mismo.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activos.map(plan => (
            <div key={plan.id} style={{ border: `1px solid ${t.line}`, borderRadius: radius.card, padding: 14, background: t.surface }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>{plan.nombre}</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: t.ink }}>{plan.precio} €</p>
              </div>
              {plan.descripcion && <p style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>{plan.descripcion}</p>}
              <button
                type="button"
                disabled={!socioId || estado.fase === 'creando' || configuracionIncompleta}
                onClick={() => comprar(plan)}
                style={{
                  width: '100%', height: 40, borderRadius: radius.pillBtnXs, border: 'none', marginTop: 10,
                  fontSize: 12.5, fontWeight: 800, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
                  cursor: (!socioId || estado.fase === 'creando' || configuracionIncompleta) ? 'default' : 'pointer',
                  opacity: (!socioId || estado.fase === 'creando' || configuracionIncompleta) ? 0.5 : 1,
                }}
              >
                {estado.fase === 'creando' && estado.planId === plan.id ? 'Un momento…' : 'Comprar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

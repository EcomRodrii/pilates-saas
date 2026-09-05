'use client';

import { useCallback, useState } from 'react';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { CheckoutEmbebido } from '@/components/checkout-widget/checkout-embebido';
import { MODO_TOKENS } from '@/lib/portal-paleta';
import { iniciarCompra, clavePublicableStripe } from '@/lib/student/comprar';
import { euros } from '@/lib/student/formato';
import type { PlanTarifa } from '@/lib/types';

// La compra, DENTRO de la app.
//
// ⚠️ Reutiliza `CheckoutEmbebido` tal cual — el mismo componente que cobra hoy
// en `/reservar`, con su Payment Element, su manejo de errores de Stripe y su
// `setup_future_usage`. No se reescribe nada de Stripe: solo se le entrega el
// `clientSecret` que emite `app/api/public/checkout-embebido`.
//
// ⚠️ El importe NO viaja desde aquí. Se manda `planId` y el servidor resuelve
// `plan.precio`. Lo que la alumna ve en la tarjeta sale de esa misma fila, así
// que la UI y el cobro no pueden divergir — que es el criterio que pediste.
//
// `MODO_TOKENS.dia` es la paleta clara del widget, que es la que encaja con el
// crema de esta app. No se inventa una traducción de tokens: se usa la que ya
// existe.

type Estado =
  | { fase: 'listo' }
  | { fase: 'preparando' }
  | { fase: 'pagando'; clientSecret: string }
  | { fase: 'error'; mensaje: string; sesionCaducada?: boolean }
  | { fase: 'hecho' };

export function HojaCompra({
  plan, cobertura, studioId, socioId, stripeAccountId, onCerrar, onComprado, onSesionCaducada,
}: {
  plan: PlanTarifa | null;
  /**
   * A qué tipos de clase está ACOTADO el plan («Solo para Reformer»), ya
   * resuelto a nombres por `coberturaProducto`. `null` = sirve para todas.
   * Se repite aquí, y no solo en la tarjeta de la tienda, porque esta es la
   * última pantalla antes de pagar: es donde tiene que estar lo que cambia
   * para qué sirve lo que se compra.
   */
  cobertura?: string | null;
  studioId: string;
  socioId: string | null;
  stripeAccountId: string | null;
  onCerrar: () => void;
  onComprado: () => void;
  onSesionCaducada: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'listo' });
  // ¿Hay una confirmación de pago EN VUELO? Lo dice el propio checkout
  // (`onProcesando`), no una suposición desde fuera.
  const [confirmando, setConfirmando] = useState(false);
  const publishableKey = clavePublicableStripe();

  const arrancar = useCallback(async () => {
    if (!plan) return;
    setEstado({ fase: 'preparando' });
    const r = await iniciarCompra(studioId, plan.id, socioId);
    if (r.ok) { setEstado({ fase: 'pagando', clientSecret: r.clientSecret }); return; }
    setEstado({ fase: 'error', mensaje: r.error, sesionCaducada: r.sesionCaducada });
  }, [plan, studioId, socioId]);

  if (!plan) return null;

  // El estudio todavía no puede cobrar. Se dice ANTES de que pulse, no después
  // de un error de Stripe que no significa nada para ella.
  const sinCobro = !stripeAccountId || !publishableKey;

  return (
    // No se puede cerrar —ni por velo, ni con Esc, ni arrastrando— en los dos
    // momentos en los que hay dinero en movimiento:
    //
    //   · PREPARANDO: se está creando la sesión de cobro en Stripe.
    //   · CONFIRMANDO: ya pulsó pagar y Stripe está resolviendo.
    //
    // Y SOLO en esos dos. Mientras rellena la tarjeta cerrar es legítimo: es
    // arrepentirse antes de pagar, y bloquearlo sería peor que el problema.
    // Distinguir las dos cosas exigía que el checkout lo dijera, porque desde
    // fuera «rellenando» y «confirmando» se ven igual; ahora lo dice con
    // `onProcesando`, que es opcional y no cambia nada para /reservar ni para
    // el widget.
    <Sheet
      open
      onClose={estado.fase === 'preparando' || confirmando ? () => {} : onCerrar}
      label={`Comprar ${plan.nombre}`}
    >
      <div className="px" style={{ paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <h2 className="t-h1" style={{ fontSize: 19 }}>{plan.nombre}</h2>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{euros(Number(plan.precio))}</p>
        </div>

        {cobertura && (
          <p
            data-testid="cobertura-compra"
            style={{
              display: 'inline-flex', margin: '8px 0 0', padding: '3px 9px', borderRadius: 999,
              background: 'var(--warning-soft)', color: 'var(--warning-foreground)',
              fontSize: 11.5, fontWeight: 800,
            }}
          >
            {cobertura}
          </p>
        )}

        {sinCobro ? (
          <>
            <p className="t-meta" style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.55 }}>
              Este estudio todavía no tiene los pagos activados, así que no se puede comprar desde aquí.
              Escríbeles y te lo resuelven en un momento.
            </p>
            <Button variant="secondary" full onClick={onCerrar} style={{ marginTop: 14 }}>Entendido</Button>
          </>
        ) : estado.fase === 'listo' ? (
          <>
            {/* ⚠️ El cobro arranca con un gesto suyo, no al abrir la hoja.
                Pedir el `clientSecret` en un efecto creaba un PaymentIntent en
                Stripe por el mero hecho de mirar el producto — intentos
                abandonados en el panel del estudio por cada curioseo. Y de paso
                desaparece el `setState` dentro de un efecto que el compilador
                de React rechaza, con razón. */}
            <p className="t-meta" style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.55 }}>
              Vas a pagar {euros(Number(plan.precio))}. El cobro lo hace el estudio a través de Stripe.
            </p>
            <Button full onClick={() => void arrancar()} style={{ marginTop: 14 }}>
              Continuar al pago
            </Button>
          </>
        ) : estado.fase === 'preparando' ? (
          <p className="t-meta" style={{ margin: '12px 0', fontSize: 12.5 }}>Preparando el pago…</p>
        ) : estado.fase === 'error' ? (
          <>
            <p role="alert" style={{ margin: '10px 0 0', background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 12.5, fontWeight: 700 }}>
              {estado.mensaje}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {estado.sesionCaducada
                ? <Button full onClick={onSesionCaducada}>Volver a entrar</Button>
                : <Button full onClick={() => void arrancar()}>Intentar de nuevo</Button>}
              <Button variant="secondary" onClick={onCerrar}>Cerrar</Button>
            </div>
          </>
        ) : estado.fase === 'hecho' ? (
          <div className="a-pop" style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <span aria-hidden style={{ width: 60, height: 60, margin: '0 auto', borderRadius: 999, background: '#4F8A5B', color: '#fff', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
            <h3 className="t-h1" style={{ fontSize: 19, marginTop: 14 }}>Compra realizada</h3>
            <p className="t-meta" style={{ marginTop: 6, fontSize: 12.5 }}>
              Ya está en tu cuenta. Puedes reservar con ella ahora mismo.
            </p>
            <Button full onClick={onComprado} style={{ marginTop: 14 }}>Ver mis bonos</Button>
          </div>
        ) : (
          <CheckoutEmbebido
            t={MODO_TOKENS.dia}
            plan={plan}
            clientSecret={estado.clientSecret}
            publishableKey={publishableKey}
            stripeAccountId={stripeAccountId}
            onProcesando={setConfirmando}
            onExito={() => { setConfirmando(false); setEstado({ fase: 'hecho' }); }}
            onCerrar={onCerrar}
          />
        )}
      </div>
    </Sheet>
  );
}

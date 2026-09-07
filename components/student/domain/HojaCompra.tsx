'use client';

import { useCallback, useState } from 'react';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { CheckoutEmbebido } from '@/components/checkout-widget/checkout-embebido';
import { MODO_TOKENS } from '@/lib/portal-paleta';
import { comprobarCodigo, iniciarCompra, clavePublicableStripe } from '@/lib/student/comprar';
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
  | { fase: 'pagando'; clientSecret: string; importe: number; descuento: number }
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

  // ── Código de descuento ───────────────────────────────────────────────
  // ⚠️ AQUÍ NO SE RESTA NADA. Se manda el texto y el servidor decide, con la
  // MISMA función que usa el cobro. Un descuento calculado en el cliente puede
  // divergir del cargo, y ese es justo el fallo que este bloque evita.
  const [codigo, setCodigo] = useState('');
  const [comprobando, setComprobando] = useState(false);
  const [codigoDicho, setCodigoDicho] = useState<{ ok: boolean; texto: string } | null>(null);

  const comprobar = useCallback(async () => {
    if (!plan || !codigo.trim() || comprobando) return;
    setComprobando(true);
    const r = await comprobarCodigo(studioId, codigo.trim(), Number(plan.precio), socioId);
    setComprobando(false);
    setCodigoDicho(r.ok
      ? { ok: true, texto: `Código aplicado: −${euros(r.descuento)}` }
      : { ok: false, texto: r.motivo });
  }, [plan, codigo, comprobando, studioId, socioId]);

  const arrancar = useCallback(async () => {
    if (!plan) return;
    setEstado({ fase: 'preparando' });
    const r = await iniciarCompra(studioId, plan.id, socioId, codigo.trim() || null);
    if (r.ok) {
      // El importe con el que el servidor creó el cobro. Si un código dejó de
      // valer entre comprobarlo y pagar, aquí llega el precio entero y eso es
      // lo que se enseña — sin sorpresa en el extracto.
      setEstado({
        fase: 'pagando',
        clientSecret: r.clientSecret,
        importe: Number.isFinite(r.importe) ? r.importe : Number(plan.precio),
        descuento: r.descuento,
      });
      if (codigo.trim() && !r.codigoAplicado) {
        setCodigoDicho({ ok: false, texto: 'Ese código ya no se puede aplicar. Pagas el precio normal.' });
      }
      return;
    }
    setEstado({ fase: 'error', mensaje: r.error, sesionCaducada: r.sesionCaducada });
  }, [plan, studioId, socioId, codigo]);

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

        {/* Cada fase entra con un fundido corto. Antes el contenido de la hoja
            SALTABA de golpe —«continuar» → «preparando» → tarjeta → «hecho»—
            en la pantalla donde se mueve el dinero, que es justo donde un
            cambio brusco se lee como que algo ha fallado.
            La `key` por fase es lo que lo hace funcionar: sin remontar, React
            reutiliza el nodo, la clase no se vuelve a aplicar y la animación
            solo se vería la primera vez.
            `.a-fade` (250 ms, solo opacidad) llevaba definida en el sistema
            desde el principio sin que la usara nadie. */}
        {/* `data-testid` con la fase: es lo que hace OBSERVABLE en qué punto
            está la hoja. Sin él, una prueba solo puede adivinarlo por textos
            que dependen de que Stripe cargue —y en pruebas no carga—, así que
            anclar en «Pagar 70 €» era anclar en algo que a veces no existe. */}
        <div
          key={sinCobro ? 'sin-cobro' : estado.fase}
          data-testid={'fase-' + (sinCobro ? 'sin-cobro' : estado.fase)}
          className="a-fade"
        >
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
            <p className="t-small t-dim" style={{ marginTop: 'var(--s-3)' }}>
              El cobro lo hace el estudio a través de Stripe.
            </p>

            {/* ── Código de descuento ─────────────────────────────────────
                El campo no promete nada por sí solo: quien dice si vale, y
                cuánto, es el servidor. */}
            <div style={{ marginTop: 'var(--s-4)' }}>
              <p className="t-label" style={{ marginBottom: 'var(--s-2)' }}>¿Tienes un código?</p>
              <div className="row" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                <input
                  className="input"
                  value={codigo}
                  onChange={(e) => { setCodigo(e.target.value.toUpperCase()); setCodigoDicho(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void comprobar(); }}
                  placeholder="CÓDIGO"
                  aria-label="Código de descuento"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ height: 'var(--h-control-md)', fontSize: 13.5, letterSpacing: '.06em' }}
                />
                <Button
                  variant="secondary"
                  onClick={() => void comprobar()}
                  loading={comprobando}
                  disabled={!codigo.trim()}
                  className="no-shrink"
                >
                  Aplicar
                </Button>
              </div>
              {codigoDicho && (
                <p
                  role="status"
                  data-testid="codigo-resultado"
                  className={'note ' + (codigoDicho.ok ? 'note--ok' : 'note--warn')}
                  style={{ marginTop: 'var(--s-2)' }}
                >
                  {codigoDicho.texto}
                </p>
              )}
            </div>

            <Button full onClick={() => void arrancar()} style={{ marginTop: 'var(--s-4)' }}>
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
            <span aria-hidden style={{ width: 60, height: 60, margin: '0 auto', borderRadius: 999, background: 'var(--success)', color: '#fff', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
            <h3 className="t-h1" style={{ fontSize: 19, marginTop: 14 }}>Compra realizada</h3>
            <p className="t-meta" style={{ marginTop: 6, fontSize: 12.5 }}>
              Ya está en tu cuenta. Puedes reservar con ella ahora mismo.
            </p>
            <Button full onClick={onComprado} style={{ marginTop: 14 }}>Ver mis bonos</Button>
          </div>
        ) : (
          <>
            {/* ⚠️ El desglose sale del SERVIDOR, no de una resta aquí. Con un
                código aplicado se ve el precio original, lo descontado y el
                total; sin él, no se pinta nada y la pantalla queda como
                estaba. El total es el importe con el que se creó el cobro. */}
            {/* ⚠️ Y si el código YA NO VALE, se dice AQUÍ. El aviso se guardaba
                pero solo se pintaba en la fase anterior, que para entonces ya
                no está en pantalla: la alumna se quedaba esperando un
                descuento que no iba a llegar y lo descubría en el extracto.
                Lo cazó la prueba, no la revisión. */}
            {estado.descuento === 0 && codigoDicho && !codigoDicho.ok && (
              <p
                role="status"
                data-testid="codigo-resultado"
                className="note note--warn"
                style={{ marginBottom: 'var(--s-3)' }}
              >
                {codigoDicho.texto}
              </p>
            )}
            {estado.descuento > 0 && (
              <div
                className="card card--pad stack"
                data-testid="desglose"
                style={{ ['--gap' as string]: 'var(--s-1)', marginBottom: 'var(--s-3)' }}
              >
                <div className="row row--between">
                  <span className="t-small t-dim">Precio</span>
                  <span className="t-small t-num">{euros(Number(plan.precio))}</span>
                </div>
                <div className="row row--between">
                  <span className="t-small t-dim">Descuento</span>
                  <span className="t-small t-num" style={{ color: 'var(--success)', fontWeight: 800 }}>
                    −{euros(estado.descuento)}
                  </span>
                </div>
                <div aria-hidden style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
                <div className="row row--between">
                  <span className="t-card-title">Total</span>
                  <span className="t-card-title t-num">{euros(estado.importe)}</span>
                </div>
              </div>
            )}
            <CheckoutEmbebido
            t={MODO_TOKENS.dia}
            plan={plan}
            clientSecret={estado.clientSecret}
            publishableKey={publishableKey}
            stripeAccountId={stripeAccountId}
            importeTotal={estado.importe}
            onProcesando={setConfirmando}
            onExito={() => { setConfirmando(false); setEstado({ fase: 'hecho' }); }}
            onCerrar={onCerrar}
            />
          </>
        )}
        </div>
      </div>
    </Sheet>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { Sello } from '@/components/student/ui/Sello';
import { abrirGuardarTarjeta, esperarTarjetaGuardada } from '@/lib/student/pago';
import { clavePublicableStripe } from '@/lib/student/comprar';
import { textoTarjeta, type TarjetaConfirmada } from '@/lib/student/guardar-tarjeta-reglas';

/**
 * «Cambiar tarjeta» / «Añadir tarjeta» SIN salir de la app (6-oct-2026).
 *
 * El formulario de Stripe va DENTRO de la hoja (Checkout incrustado en `mode:
 * 'setup'`, la misma pieza con la que la app paga un recibo): en la app de iOS una
 * página de Stripe se abriría en Safari. No se cobra nada.
 *
 * ⚠️ Nada optimista. Que Stripe cierre su formulario no es «guardada»: la escribe el
 * webhook en la ficha, y la hoja solo dice «Tarjeta guardada» cuando el servidor la
 * lee ahí (`GET /api/public/tarjeta?sesion=`). Si no llega a tiempo, lo dice así.
 */
type Fase =
  | { fase: 'preparando' }
  | { fase: 'formulario'; clientSecret: string; sesion: string }
  | { fase: 'comprobando'; sesion: string }
  | { fase: 'guardada'; tarjeta: TarjetaConfirmada }
  | { fase: 'tarda' }
  | { fase: 'error'; mensaje: string; sesionCaducada?: boolean };

export function HojaGuardarTarjeta({
  studioId, stripeAccountId, cambiar, consentimiento, sesionDeVuelta, onCerrar, onGuardada, onSesionCaducada,
}: {
  studioId: string;
  stripeAccountId: string;
  /** Ya tiene una: «Cambiar tarjeta». */
  cambiar: boolean;
  /** La línea que dice qué permite guardarla. */
  consentimiento: string;
  /** Volvió de Stripe con `session_id` (un método que redirige): directo a comprobar ESA sesión. */
  sesionDeVuelta?: string | null;
  onCerrar: () => void;
  /** El servidor la confirmó en su ficha: releer lo que dependa de ella. */
  onGuardada: () => void;
  onSesionCaducada: () => void;
}) {
  const [f, setF] = useState<Fase>(sesionDeVuelta ? { fase: 'comprobando', sesion: sesionDeVuelta } : { fase: 'preparando' });
  const viva = useRef(true);
  const arrancado = useRef(false);
  const publishableKey = clavePublicableStripe();
  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    try { return loadStripe(publishableKey, { stripeAccount: stripeAccountId }); } catch { return null; }
  }, [publishableKey, stripeAccountId]);

  const comprobar = useCallback((sesion: string) => {
    setF({ fase: 'comprobando', sesion });
    void esperarTarjetaGuardada(studioId, sesion, () => viva.current).then((r) => {
      if (r.tipo === 'cancelado') return;
      if (r.tipo === 'guardada') { setF({ fase: 'guardada', tarjeta: r.tarjeta }); onGuardada(); return; }
      if (r.tipo === 'sesion' || r.tipo === 'dos-pasos') {
        setF({ fase: 'error', mensaje: 'Tu sesión ha caducado. Vuelve a entrar para ver tu tarjeta.', sesionCaducada: true });
        return;
      }
      setF({ fase: 'tarda' });
    });
  }, [studioId, onGuardada]);

  const preparar = useCallback(async () => {
    setF({ fase: 'preparando' });
    const r = await abrirGuardarTarjeta(studioId);
    if (!viva.current) return;
    if (!r.ok) { setF({ fase: 'error', mensaje: r.error, sesionCaducada: r.sesionCaducada }); return; }
    setF({ fase: 'formulario', clientSecret: r.clientSecret, sesion: r.checkoutSessionId });
  }, [studioId]);

  // Arranca al abrir la hoja (se abre con el gesto), una sola vez aunque React monte dos veces en desarrollo.
  useEffect(() => {
    viva.current = true;
    if (!arrancado.current) {
      arrancado.current = true;
      const sesion = sesionDeVuelta;
      void Promise.resolve().then(() => (sesion ? comprobar(sesion) : preparar()));
    }
    return () => { viva.current = false; };
  }, [preparar, comprobar, sesionDeVuelta]);

  const titulo = cambiar ? 'Cambiar tarjeta' : 'Añadir tarjeta';
  // Mientras se prepara o se comprueba no se cierra: no hay nada que deshacer y se perdería el desenlace.
  const bloqueada = f.fase === 'preparando' || f.fase === 'comprobando';

  return (
    <Sheet open onClose={bloqueada ? () => {} : onCerrar} label={titulo}>
      <div className="px" style={{ paddingBottom: 16 }} data-testid={`guardar-tarjeta-${f.fase}`}>
        <h2 className="t-title" style={{ marginBottom: 6 }}>{titulo}</h2>

        {(f.fase === 'preparando' || f.fase === 'formulario') && (
          <p className="t-meta" style={{ margin: '0 0 12px', lineHeight: 1.5 }} data-testid="consentimiento-tarjeta">
            No se te cobra nada ahora. {consentimiento}
          </p>
        )}

        {f.fase === 'preparando' && <p className="t-meta" role="status">Preparando el formulario…</p>}

        {f.fase === 'error' && (
          <>
            <p role="alert" className="note note--danger">{f.mensaje}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {f.sesionCaducada
                ? <Button full onClick={onSesionCaducada}>Volver a entrar</Button>
                : <Button full onClick={() => void preparar()}>Intentar de nuevo</Button>}
              <Button variant="secondary" onClick={onCerrar}>Cerrar</Button>
            </div>
          </>
        )}

        {f.fase === 'formulario' && (stripePromise ? (
          // `key` por client_secret: el proveedor no admite cambiarlo (react-stripe-js).
          <div data-testid="checkout-incrustado" style={{ minHeight: 320 }}>
            <EmbeddedCheckoutProvider
              key={f.clientSecret}
              stripe={stripePromise}
              options={{ clientSecret: f.clientSecret, onComplete: () => comprobar(f.sesion) }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        ) : (
          <p className="note note--warn">Ahora mismo no se pueden guardar tarjetas desde la app. Tu tarjeta no ha cambiado.</p>
        ))}

        {f.fase === 'comprobando' && (
          <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <span aria-hidden style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 'var(--radius-round)', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'apSpin .7s linear infinite' }} />
            <h3 className="t-title" style={{ marginTop: 12 }}>Comprobando tu tarjeta…</h3>
            <p className="t-meta" style={{ marginTop: 6 }}>Tarda unos segundos; no tienes que hacer nada.</p>
          </div>
        )}

        {f.fase === 'guardada' && (
          <div className="a-pop" style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <Sello />
            <h3 className="t-title" style={{ marginTop: 14 }}>Tarjeta guardada</h3>
            <p className="t-meta" style={{ marginTop: 6 }}>
              {textoTarjeta(f.tarjeta)}{f.tarjeta.caducidad ? ` · caduca ${f.tarjeta.caducidad}` : ''}
            </p>
            <Button full onClick={onCerrar} style={{ marginTop: 14 }}>Listo</Button>
          </div>
        )}

        {f.fase === 'tarda' && (
          <div role="status">
            <h3 className="t-title">Todavía no la vemos guardada</h3>
            <p className="t-meta" style={{ marginTop: 6, lineHeight: 1.55 }}>
              Si terminaste el formulario, aparecerá aquí en unos minutos; si no aparece, vuelve a intentarlo. No se te ha
              cobrado nada.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="secondary" full onClick={onCerrar}>Cerrar</Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

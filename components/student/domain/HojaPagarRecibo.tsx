'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { Sello } from '@/components/student/ui/Sello';
import { abrirPagoDeRecibo, prepararRenovacion } from '@/lib/student/pagos-acciones';
import { esperarReciboPagado } from '@/lib/student/estado-compra';
import { clavePublicableStripe } from '@/lib/student/comprar';
import { euros, fechaLarga } from '@/lib/student/formato';

/**
 * Pagar un recibo (o renovar el plan) SIN salir de la app (RECIBOS · 6-oct-2026).
 *
 * Antes «Pagar ahora» y «Renovar mi plan» mandaban a la página de Stripe y volvían a
 * `/pagos?pago=ok`, que decía «Pago recibido ✓» sin comprobar nada. Ahora el Checkout
 * de Stripe va DENTRO de la hoja, y «Pagado» solo se dice cuando el servidor lee el
 * recibo COBRADO (`estado-pago?reciboId=`): el que confirma el cobro es el webhook
 * (`confirmarCobro`), nunca esta pantalla.
 *
 * ⚠️ El importe y a quién se cobra los decide el SERVIDOR desde el recibo. Aquí no
 * viaja ni un euro: el importe que se enseña arriba es solo el título.
 *
 * Sin Bizum (exige salir a la app del banco) y sin Apple Pay prometido: lo que Stripe
 * ofrezca dentro (tarjeta, Link) es lo que hay.
 */
type Fase =
  | { fase: 'preparando' }
  | { fase: 'pagando'; clientSecret: string; reciboId: string }
  | { fase: 'comprobando'; reciboId: string }
  | { fase: 'pagado'; renovadoHasta: string | null }
  | { fase: 'tarda' }
  | { fase: 'error'; mensaje: string; sesionCaducada?: boolean };

export function HojaPagarRecibo({
  studioId, stripeAccountId, que, titulo, importe, onCerrar, onPagado, onSesionCaducada, enlaceEstudio,
}: {
  studioId: string;
  stripeAccountId: string;
  /** Un recibo concreto, o «renovar mi plan» (el servidor prepara o reutiliza el recibo). */
  que: { reciboId: string } | { renovar: true };
  titulo: string;
  /** Solo para el título; el importe lo pone el servidor. */
  importe?: number | null;
  onCerrar: () => void;
  /** El servidor confirmó el cobro: releer lo que dependa de él. */
  onPagado: () => void;
  onSesionCaducada: () => void;
  enlaceEstudio?: string;
}) {
  const [f, setF] = useState<Fase>({ fase: 'preparando' });
  const viva = useRef(true);
  const arrancado = useRef(false);
  const publishableKey = clavePublicableStripe();
  const stripePromise = useMemo(() => {
    if (!publishableKey) return null;
    try { return loadStripe(publishableKey, { stripeAccount: stripeAccountId }); } catch { return null; }
  }, [publishableKey, stripeAccountId]);

  const preparar = useCallback(async () => {
    setF({ fase: 'preparando' });
    let reciboId: string;
    if ('reciboId' in que) {
      reciboId = que.reciboId;
    } else {
      const prep = await prepararRenovacion(studioId);
      if (!viva.current) return;
      if (!prep.ok) { setF({ fase: 'error', mensaje: prep.error }); return; }
      reciboId = prep.reciboId;
    }
    const r = await abrirPagoDeRecibo(studioId, reciboId);
    if (!viva.current) return;
    if (!r.ok) { setF({ fase: 'error', mensaje: r.error, sesionCaducada: r.sesionCaducada }); return; }
    setF({ fase: 'pagando', clientSecret: r.clientSecret, reciboId });
  }, [que, studioId]);

  // El cobro arranca al abrir la hoja (la hoja SE ABRE con el gesto de pagar), una
  // sola vez aunque React monte dos veces en desarrollo.
  useEffect(() => {
    viva.current = true;
    if (!arrancado.current) {
      arrancado.current = true;
      void Promise.resolve().then(preparar);
    }
    return () => { viva.current = false; };
  }, [preparar]);

  // Stripe cerró su Checkout: desde aquí manda el servidor.
  const alCompletar = useCallback((reciboId: string) => {
    setF({ fase: 'comprobando', reciboId });
    void esperarReciboPagado(studioId, reciboId, () => viva.current).then((r) => {
      if (r.tipo === 'cancelado') return;
      if (r.tipo === 'pagado') { setF({ fase: 'pagado', renovadoHasta: r.renovadoHasta }); onPagado(); return; }
      if (r.tipo === 'sesion' || r.tipo === 'dos-pasos') {
        setF({ fase: 'error', mensaje: 'Tu sesión ha caducado. Vuelve a entrar: tu pago está hecho y no se pierde.', sesionCaducada: true });
        return;
      }
      setF({ fase: 'tarda' });
    });
  }, [studioId, onPagado]);

  // Mientras se prepara o se comprueba, no se cierra: hay dinero en movimiento.
  const bloqueada = f.fase === 'preparando' || f.fase === 'comprobando';

  return (
    <Sheet open onClose={bloqueada ? () => {} : onCerrar} label={titulo}>
      <div className="px" style={{ paddingBottom: 16 }} data-testid={`pago-recibo-${f.fase}`}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <h2 className="t-title">{titulo}</h2>
          {importe != null && <p className="t-num" style={{ margin: 0, fontWeight: 800 }}>{euros(importe)}</p>}
        </div>

        {f.fase === 'preparando' && <p className="t-meta" role="status">Preparando el pago…</p>}

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

        {f.fase === 'pagando' && (stripePromise ? (
          // `key` por client_secret: el proveedor no admite cambiarlo (react-stripe-js).
          <div data-testid="checkout-incrustado" style={{ minHeight: 320 }}>
            <EmbeddedCheckoutProvider
              key={f.clientSecret}
              stripe={stripePromise}
              options={{ clientSecret: f.clientSecret, onComplete: () => alCompletar(f.reciboId) }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        ) : (
          <p className="note note--warn">El pago online no está disponible ahora mismo. No se te ha cobrado nada.</p>
        ))}

        {f.fase === 'comprobando' && (
          <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '12px 0 4px' }}>
            <span aria-hidden style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 'var(--radius-round)', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'apSpin .7s linear infinite' }} />
            <h3 className="t-title" style={{ marginTop: 12 }}>Comprobando tu pago…</h3>
            <p className="t-meta" style={{ marginTop: 6 }}>Tarda unos segundos; no tienes que hacer nada.</p>
          </div>
        )}

        {f.fase === 'pagado' && (
          <div className="a-pop" style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <Sello />
            <h3 className="t-title" style={{ marginTop: 14 }}>Pagado</h3>
            {f.renovadoHasta && (
              <p className="t-meta" style={{ marginTop: 6 }}>Tu plan sigue activo hasta el {fechaLarga(f.renovadoHasta)}.</p>
            )}
            <Button full onClick={onCerrar} style={{ marginTop: 14 }}>Listo</Button>
          </div>
        )}

        {f.fase === 'tarda' && (
          <div role="status">
            <h3 className="t-title">Tu pago está hecho</h3>
            <p className="t-meta" style={{ marginTop: 6, lineHeight: 1.55 }}>
              Lo estamos confirmando con el estudio. Te avisamos en cuanto conste; no vuelvas a pagar.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {enlaceEstudio && <Link href={enlaceEstudio} className="btn btn--secondary" style={{ flex: 1 }}>Escribir al estudio</Link>}
              <Button variant="secondary" onClick={onCerrar}>Cerrar</Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
